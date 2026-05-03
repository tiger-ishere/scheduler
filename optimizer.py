def evaluate_solution(locations, schedule):
    total_penalty = 0
    buses_used = set()

    for node in locations:
        if node.id == 0: continue # Skip dummy
        
        # Find if this node was actually scheduled
        assigned = next((s for s in schedule if s["location_node_id"] == node.id), None)
        if not assigned:
            total_penalty += 100000 # Massive drop penalty
            continue
        
        buses_used.add(assigned["bus_id"])
        
        # Soft penalize exact target deviations (50 per min late, 10 per min early)
        deviation = assigned["start_time"] - node.target_time
        if deviation < 0:
            total_penalty += abs(deviation) * 10  # early penalty
        elif deviation > 0:
            total_penalty += deviation * 50       # late penalty

    buses = len(buses_used)
    
    # Match the OR-Tools internal objective - Bus Deployment Cost
    score = (buses * 200) + total_penalty

    return {
        "buses": buses,
        "penalty": total_penalty,
        "score": score
    }