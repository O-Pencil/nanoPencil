import { Container, type SelectItem, SelectList } from "@pencil-agent/tui";
import {
	getCustomProtocolProviderDefinition,
	isCustomProtocolProvider,
} from "../../../core/custom-providers.js";
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

		const items: SelectItem[] = providers.map((provider) => {
			const customProvider = isCustomProtocolProvider(provider)
				? getCustomProtocolProviderDefinition(provider)
				: undefined;

			return {
				value: provider,
				label: customProvider?.label ?? provider,
				description:
					provider === currentProvider
						? customProvider
							? "(current, press Enter to edit)"
							: "(current)"
						: customProvider?.description,
			};
		});

		this.selectList = new SelectList(
			items,
			Math.min(Math.max(items.length, 4), 12),
			getSelectListTheme(),
		);
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
