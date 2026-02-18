import os
import random
import uuid

def generate_multi_hop_data(output_dir: str, num_files: int = 1000):
    """
    Generates a synthetic dataset for RLM benchmarking.
    Creates a 'Multi-Hop Link' where Log A points to a Cause ID defined in Log Z.
    """
    os.makedirs(output_dir, exist_ok=True)
    
    # 1. Create the 'Needle' - Log Z (The Definition)
    cause_id = "ID-9982-ALPHA"
    threshold = "0.85v"
    valve_setting = "Open (Full Flow)"
    
    log_z_content = f"""
    SYSTEM_DEFINITIONS:
    ERROR_CODE: {cause_id}
    PHYSICAL_SOURCE: Sensor Threshold exceeded {threshold}.
    REMEDIATION_REQUIREMENT: Ensure Coolant Valve Setting is {valve_setting}.
    TIMESTAMP: 2026-02-12 00:01:00
    """
    
    with open(os.path.join(output_dir, "log_z.txt"), "w") as f:
        f.write(log_z_content)

    # 2. Create the 'Source' - Log A (The Event)
    log_a_content = f"""
    INCIDENT_REPORT:
    OUTAGE_DETECTED: 2026-02-12 06:15:00
    PRIMARY_CAUSE_ID: {cause_id}
    SUMMARY: System-wide cascade following sensor spike. Refer to definitions log for physical config details.
    """
    
    with open(os.path.join(output_dir, "log_a.txt"), "w") as f:
        f.write(log_a_content)

    # 3. Create Junk Data
    for i in range(num_files - 2):
        junk_content = f"Junk log entry {uuid.uuid4()}. Nothing to see here. Status: OK."
        with open(os.path.join(output_dir, f"junk_{i}.txt"), "w") as f:
            f.write(junk_content)

    print(f"--- Synthetic Bench Data Generated ---")
    print(f"Total Files: {num_files}")
    print(f"Goal: Identify '{threshold}' and '{valve_setting}' via {cause_id}.")

if __name__ == "__main__":
    generate_multi_hop_data("github/jadoo-labs-experiments/bench_data")
