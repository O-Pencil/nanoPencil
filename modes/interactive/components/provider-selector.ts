/**
 * Provider 选择器：列出可用 provider，选择后回调。用于「先选 provider 再选 model」流程。
 */

import { Container, type SelectItem, SelectList } from "@pencil-agent/tui";
import { getSelectListTheme } from "../theme/theme.js";
import { DynamicBorder } from "./dynamic-border.js";

export class ProviderSelectorComponent extends Container {
	private selectList: SelectList;

	constructor(
		providers: string[],
		currentProvider: string | undefined,
		onSelect: (provider: string) => void,
		onCancel: () => void,
	) {
		super();
		this.addChild(new DynamicBorder());

		const items: SelectItem[] = providers.map((p) => ({
			value: p,
			label: p,
			description: p === currentProvider ? "(当前)" : undefined,
		}));

		this.selectList = new SelectList(items, Math.min(Math.max(items.length, 4), 12), getSelectListTheme());
		this.selectList.onSelect = (item) => onSelect(item.value);
		this.selectList.onCancel = onCancel;

		const currentIndex = providers.indexOf(currentProvider ?? "");
		if (currentIndex >= 0) {
			this.selectList.setSelectedIndex(currentIndex);
		}
		this.addChild(this.selectList);
		this.addChild(new DynamicBorder());
	}

	getSelectList(): SelectList {
		return this.selectList;
	}
}
