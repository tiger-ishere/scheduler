from ortools.constraint_solver import routing_enums_pb2
from ortools.constraint_solver import pywrapcp
import openrouteservice
import math
import os
from dotenv import load_dotenv

load_dotenv()
ORS_API_KEY = os.environ.get("ORS_API_KEY", "")
ors_client = None
if ORS_API_KEY:
    try:
        ors_client = openrouteservice.Client(key=ORS_API_KEY)
    except Exception as e:
        print(f"ORS Client init error: {e}")

_ors_matrix_cache = {}

def calculate_haversine_fallback(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) * math.sin(dlat / 2) +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) * math.sin(dlon / 2))
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    distance_km = R * c
    # Realistic mixed-city/highway speed around 35-40kmh -> 1.7 mins per km for Kerala roads
    return int(math.ceil(distance_km * 1.7))

def get_ors_time_matrix(nodes, is_ilp=True):
    coords = [[n["lng"], n["lat"]] for n in nodes]
    cache_key = str(coords) + str(is_ilp)
    if cache_key in _ors_matrix_cache:
        print("ORS Cached Matrix HIT!")
        return _ors_matrix_cache[cache_key]

    num_nodes = len(nodes)
    time_matrix = [[0]*num_nodes for _ in range(num_nodes)]

    def apply_fallback():
        print("ORS Routing disabled or failed. Activating Euclidean Geometry Fallback Matrix.")
        for i in range(num_nodes):
            for j in range(num_nodes):
                if is_ilp and i == 0:
                    time_matrix[i][j] = 0
                else:
                    time_matrix[i][j] = calculate_haversine_fallback(nodes[i]["lat"], nodes[i]["lng"], nodes[j]["lat"], nodes[j]["lng"])
        return time_matrix

    if not ors_client:
        return apply_fallback()

    try:
        matrix_result = ors_client.distance_matrix(locations=coords, profile='driving-car', metrics=['duration'])
        durations = matrix_result['durations'] 
        
        for i in range(num_nodes):
            for j in range(num_nodes):
                if is_ilp and i == 0:
                    time_matrix[i][j] = 0
                else:
                    # Convert raw API seconds into minutes (Multiply by 1.5x for heavy vehicle / bus physics on Kerala roads)
                    time_matrix[i][j] = int(math.ceil((durations[i][j] / 60.0) * 1.5))
                    
        _ors_matrix_cache[cache_key] = time_matrix
        print("ORS API Routing Matrix resolved securely.")
        return time_matrix
    except Exception as e:
        print("ORS API Error:", str(e))
        return apply_fallback()

def get_ors_driving_poly_path(lat1, lon1, lat2, lon2):
    if not ors_client: return [[lat1, lon1], [lat2, lon2]]
    try:
        route = ors_client.directions(coordinates=[[lon1, lat1], [lon2, lat2]], profile='driving-car', format='json')
        geometry_encoded = route['routes'][0]['geometry']
        decoded = openrouteservice.convert.decode_polyline(geometry_encoded)
        return [[p[1], p[0]] for p in decoded['coordinates']]
    except Exception as e:
        print(f"ORS Directions Error mapping {lat1},{lon1} to {lat2},{lon2}: {e}")
        return [[lat1, lon1], [lat2, lon2]]

def build_data_model(locations, num_vehicles):
    data = {}
    if len(locations) < 2:
        return None

    # Node 0 is a dummy start depot
    all_nodes = [{"id": 0, "lat": 0, "lng": 0, "target": 0, "early": 0, "late": 1440, "svc": 0}]
    
    # Place dummy start exactly where the first pickup is (or 0 distance)
    all_nodes[0]["lat"] = locations[0].lat
    all_nodes[0]["lng"] = locations[0].lng

    for loc in locations:
        all_nodes.append({
            "id": loc.id, "lat": loc.lat, "lng": loc.lng,
            "target": loc.target_time, "early": loc.early_tolerance,
            "late": loc.late_tolerance, "svc": loc.service_time
        })

    num_nodes = len(all_nodes)
    time_matrix = get_ors_time_matrix(all_nodes)

    time_windows = []
    for n in all_nodes:
        if n["id"] == 0:
            time_windows.append((0, 1440))
        else:
            time_windows.append((max(0, n["target"] - n["early"]), min(1440, n["target"] + n["late"])))

    data['time_matrix'] = time_matrix
    data['time_windows'] = time_windows
    data['service_times'] = [n["svc"] for n in all_nodes]
    data['num_vehicles'] = num_vehicles
    
    # All vehicles start at Dummy Node (0) and MUST END at the Final Destination (the last node, num_nodes - 1)
    data['starts'] = [0] * num_vehicles
    data['ends'] = [num_nodes - 1] * num_vehicles
    data['all_nodes'] = all_nodes
    return data

def generate_smart_schedule(locations, num_vehicles=20, optimize_for="punctuality"):
    if not locations or len(locations) < 2:
        return []
    
    data = build_data_model(locations, num_vehicles)
    if not data: return []

    manager = pywrapcp.RoutingIndexManager(len(data['time_matrix']), data['num_vehicles'], data['starts'], data['ends'])
    routing = pywrapcp.RoutingModel(manager)

    # Dynamic Optimization Variables
    if optimize_for == "utilization":
        # Force the engine to cram more stops on fewer buses (high bus cost, low lateness penalty)
        bus_cost = 5000
        late_penalty = 10
        early_penalty = 2
    else:
        # Prioritize punctuality heavily (strict limits on being late)
        bus_cost = 200
        late_penalty = 50
        early_penalty = 10

    def time_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        return data['time_matrix'][from_node][to_node] + data['service_times'][from_node]

    time_callback_index = routing.RegisterTransitCallback(time_callback)

    # Define the core objective cost function (Cost of driving + Cost of deploying new bus)
    def objective_cost_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        cost = data['time_matrix'][from_node][to_node]
        # Activate bus cost logic: if traversing from Dummy Start to a real pickup
        if from_node == 0 and to_node != len(data['time_matrix']) - 1:
            cost += bus_cost
        return cost

    cost_callback_index = routing.RegisterTransitCallback(objective_cost_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(cost_callback_index)

    routing.AddDimension(
        time_callback_index,
        1440, # Uncapped slack waiting time
        1440, # Max route span 
        False, 
        'Time')
    time_dimension = routing.GetDimensionOrDie('Time')

    for location_idx, time_window in enumerate(data['time_windows']):
        # Skip dummy    for location_idx, time_window in enumerate(data['time_windows']):
        if location_idx == 0 or location_idx == len(data['time_matrix']) - 1: 
            continue
        index = manager.NodeToIndex(location_idx)
        
        # REMOVED: Rigid Hard Bounds (which forced the engine to drop nodes instead of allocating multi-buses naturally)
        time_dimension.CumulVar(index).SetRange(0, 1440)
        
        # Multi-Bus VRPTW Core Logic: 100% control via Soft Parameters.
        # This will balance adding a fixed-price bus vs accruing lateness.
        target_time = data['all_nodes'][location_idx]['target']
        time_dimension.SetCumulVarSoftUpperBound(index, target_time, late_penalty)
        time_dimension.SetCumulVarSoftLowerBound(index, target_time, early_penalty)

    # Apply soft bounds natively to the Final Common Destination (End Depot) per vehicle
    end_target_time = data['all_nodes'][-1]['target']
    for vehicle_id in range(data['num_vehicles']):
        end_index = routing.End(vehicle_id)
        time_dimension.CumulVar(end_index).SetRange(0, 1440)
        time_dimension.SetCumulVarSoftUpperBound(end_index, end_target_time, 50)
        time_dimension.SetCumulVarSoftLowerBound(end_index, end_target_time, 10)



    search_parameters = pywrapcp.DefaultRoutingSearchParameters()
    search_parameters.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PARALLEL_CHEAPEST_INSERTION
    search_parameters.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    search_parameters.time_limit.seconds = 2

    solution = routing.SolveWithParameters(search_parameters)
    if not solution: return []

    return parse_solution(data, manager, routing, solution)

def parse_solution(data, manager, routing, solution):
    time_dimension = routing.GetDimensionOrDie('Time')
    schedules = []
    
    for vehicle_id in range(data['num_vehicles']):
        start_index = routing.Start(vehicle_id)
        end_index = routing.End(vehicle_id)
        
        # If the vehicle only goes from Dummy Start -> Final Destination immediately, it's UNUSED.
        if solution.Value(routing.NextVar(start_index)) == end_index:
            continue
            
        index = solution.Value(routing.NextVar(start_index)) # Skip dummy start
        
        while not routing.IsEnd(index):
            node_index = manager.IndexToNode(index)
            time_var = time_dimension.CumulVar(index)
            start_time = solution.Min(time_var)
            
            schedules.append({
                "bus_id": vehicle_id + 1,
                "location_node_id": data['all_nodes'][node_index]["id"],
                "start_time": start_time,
                "end_time": start_time + data['service_times'][node_index]
            })
            index = solution.Value(routing.NextVar(index))
            
        # Process the Final Destination for this active bus
        final_node_index = manager.IndexToNode(end_index)
        time_var = time_dimension.CumulVar(end_index)
        final_arrival = solution.Min(time_var)
        
        schedules.append({
            "bus_id": vehicle_id + 1,
            "location_node_id": data['all_nodes'][final_node_index]["id"],
            "start_time": final_arrival,
            "end_time": final_arrival + data['service_times'][final_node_index]
        })

    return schedules

def generate_frequency_schedule(locations, num_buses, start_time_minutes, end_time_minutes):
    if len(locations) < 2: return []
    
    # Calculate base route duration using ORS
    nodes = [{"lat": loc.lat, "lng": loc.lng} for loc in locations]
    time_matrix = get_ors_time_matrix(nodes, is_ilp=False) 
    
    # Headway is the physical spacing between the deployments
    if num_buses <= 1:
        headway = 0
    else:
        headway = (end_time_minutes - start_time_minutes) / (num_buses - 1)

    schedules = []
    
    for b in range(num_buses):
        bus_start_time = int(start_time_minutes + (b * headway))
        current_time = bus_start_time
        
        # Build the sequence for this spaced bus
        for i in range(len(locations)):
            service_time = getattr(locations[i], "service_time", 5)
            end_t = current_time + service_time
            schedules.append({
                "bus_id": b + 1,
                "location_node_id": locations[i].id,
                "start_time": current_time,
                "end_time": end_t
            })
            if i < len(locations) - 1:
                # Add driving time to next stop
                current_time = end_t + time_matrix[i][i+1]

    return schedules