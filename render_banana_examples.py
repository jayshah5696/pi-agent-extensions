import os
import subprocess
from tesserax import Canvas, Text, Circle, Rect, Polyline, Group
from tesserax.layout import RowLayout, ColumnLayout
from tesserax.color import Colors

def render_rl_loop(title: str, components: list, connections: list, output_filename: str):
    with Canvas() as canvas:
        # 1. Header
        Text(title.upper(), size=20, fill=Colors.Navy).translated(150, -50)

        # 2. Main Layout
        with RowLayout(gap=80) as layout:
            nodes = {}
            for comp in components:
                with ColumnLayout(gap=10) as col:
                    if comp['type'] == 'agent':
                        nodes[comp['id']] = Circle(25, fill=Colors.Navy, stroke=Colors.Black)
                    elif comp['type'] == 'env':
                        nodes[comp['id']] = Rect(50, 40, fill=Colors.Green, stroke=Colors.Black)
                    elif comp['type'] == 'buffer':
                        nodes[comp['id']] = Rect(40, 60, fill=Colors.SkyBlue, stroke=Colors.Black)
                    Text(comp['label'], size=12, fill=Colors.Black)

        # 3. Connections
        for conn in connections:
            start_node = nodes[conn['from']]
            end_node = nodes[conn['to']]
            Polyline(
                points=[start_node.anchor(conn.get('start_anchor', 'right')), 
                        end_node.anchor(conn.get('end_anchor', 'left'))],
                stroke=Colors.Black,
                marker_end="arrow"
            )
            if conn.get('label'):
                # Simple midpoint label
                Text(conn['label'], size=8, fill=Colors.Navy).translated(150, 20)

        canvas.fit(60).save(f"github/Obsidian-Vault/Assitant/Research/assets/{output_filename}")

if __name__ == "__main__":
    # Example 1: Classic RL Loop (MDP)
    render_rl_loop(
        "Standard RL Loop (MDP)",
        [
            {"id": "agent", "type": "agent", "label": "AGENT"},
            {"id": "env", "type": "env", "label": "ENVIRONMENT"}
        ],
        [
            {"from": "agent", "to": "env", "label": "Action (At)"},
            {"from": "env", "to": "agent", "label": "State (St+1) / Reward", "start_anchor": "top", "end_anchor": "top"}
        ],
        "RL_Loop_MDP.png"
    )

    # Example 2: RLHF Pipeline
    render_rl_loop(
        "RLHF Pipeline (PPO)",
        [
            {"id": "sft", "type": "agent", "label": "SFT MODEL"},
            {"id": "rm", "type": "buffer", "label": "REWARD MODEL"},
            {"id": "ppo", "type": "agent", "label": "PPO POLICY"}
        ],
        [
            {"from": "sft", "to": "rm", "label": "Preference Data"},
            {"from": "rm", "to": "ppo", "label": "Reward Signal"}
        ],
        "RL_Loop_RLHF.png"
    )
