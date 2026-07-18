import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  Container,
  fuzzyFilter,
  getKeybindings,
  Input,
  Spacer,
  Text,
  type Focusable,
  type TUI,
} from "@earendil-works/pi-tui";
import type { WorkflowModelCandidate } from "./types.js";

const MAX_VISIBLE_MODELS = 9;

export function filterWorkflowModels(
  models: readonly WorkflowModelCandidate[],
  query: string,
): WorkflowModelCandidate[] {
  const trimmed = query.trim();
  if (!trimmed) return [...models];
  return fuzzyFilter([...models], trimmed, (model) => `${model.spec} ${model.name} ${model.provider}`);
}

export class WorkflowModelSelector extends Container implements Focusable {
  private readonly input = new Input();
  private readonly list = new Container();
  private filtered: WorkflowModelCandidate[];
  private selectedIndex: number;
  private _focused = false;

  get focused(): boolean {
    return this._focused;
  }

  set focused(value: boolean) {
    this._focused = value;
    this.input.focused = value;
  }

  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    title: string,
    private readonly models: readonly WorkflowModelCandidate[],
    private readonly currentSpec: string,
    private readonly onSelect: (model: WorkflowModelCandidate) => void,
    private readonly onCancel: () => void,
  ) {
    super();
    this.filtered = [...models];
    this.selectedIndex = Math.max(0, this.filtered.findIndex((model) => model.spec === currentSpec));

    this.addChild(new Text(theme.fg("accent", title), 1, 0));
    this.addChild(new Text(theme.fg("muted", "Type to filter models"), 1, 0));
    this.addChild(this.input);
    this.addChild(new Spacer(1));
    this.addChild(this.list);
    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.fg("muted", "↑↓ navigate  enter select  escape cancel"), 1, 0));

    this.input.onSubmit = () => this.selectCurrent();
    this.updateList();
  }

  handleInput(data: string): void {
    const keybindings = getKeybindings();
    if (keybindings.matches(data, "tui.select.up")) {
      if (this.filtered.length) {
        this.selectedIndex = this.selectedIndex === 0 ? this.filtered.length - 1 : this.selectedIndex - 1;
        this.updateList();
      }
    } else if (keybindings.matches(data, "tui.select.down")) {
      if (this.filtered.length) {
        this.selectedIndex = this.selectedIndex === this.filtered.length - 1 ? 0 : this.selectedIndex + 1;
        this.updateList();
      }
    } else if (keybindings.matches(data, "tui.select.confirm")) {
      this.selectCurrent();
    } else if (keybindings.matches(data, "tui.select.cancel")) {
      this.onCancel();
    } else {
      this.input.handleInput(data);
      this.filtered = filterWorkflowModels(this.models, this.input.getValue());
      this.selectedIndex = 0;
      this.updateList();
    }
    this.tui.requestRender();
  }

  private selectCurrent(): void {
    const selected = this.filtered[this.selectedIndex];
    if (selected) this.onSelect(selected);
  }

  private updateList(): void {
    this.list.clear();
    const start = Math.max(
      0,
      Math.min(
        this.selectedIndex - Math.floor(MAX_VISIBLE_MODELS / 2),
        this.filtered.length - MAX_VISIBLE_MODELS,
      ),
    );
    const end = Math.min(start + MAX_VISIBLE_MODELS, this.filtered.length);
    for (let index = start; index < end; index += 1) {
      const model = this.filtered[index];
      if (!model) continue;
      const selected = index === this.selectedIndex;
      const marker = selected ? this.theme.fg("accent", "→") : " ";
      const spec = selected ? this.theme.fg("accent", model.spec) : model.spec;
      const current = model.spec === this.currentSpec ? this.theme.fg("success", " ✓") : "";
      this.list.addChild(new Text(`${marker} ${spec}${current}`, 1, 0));
      if (selected) this.list.addChild(new Text(this.theme.fg("muted", `    ${model.name}`), 1, 0));
    }
    if (!this.filtered.length) {
      this.list.addChild(new Text(this.theme.fg("warning", "  No matching models"), 1, 0));
    } else if (start > 0 || end < this.filtered.length) {
      this.list.addChild(
        new Text(this.theme.fg("muted", `  ${this.selectedIndex + 1}/${this.filtered.length}`), 1, 0),
      );
    }
  }
}
