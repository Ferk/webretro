import Navigation from './navigation';

export default class UIInput {
	static #started = false;
	static #frame = 0;
	static #pressed = {};
	static #held = {};
	static #repeat = {};
	static #focused = null;

	static #KEYS = {
		ArrowUp: 'up',
		ArrowDown: 'down',
		ArrowLeft: 'left',
		ArrowRight: 'right',
		Enter: 'accept',
		Backspace: 'back',
		KeyX: 'accept',
		KeyZ: 'back',
		KeyY: 'back',
		KeyQ: 'previous-tab',
		KeyW: 'next-tab',
	};

	static #SELECTOR = [
		'button:not(:disabled)',
		'a[href]',
		'ion-button:not([disabled])',
		'ion-card[tabindex]',
		'ion-item[button]',
		'ion-select:not([disabled])',
		'ion-checkbox:not([disabled])',
		'ion-segment-button:not([disabled])',
	].join(',');

	static start() {
		if (this.#started)
			return;

		this.#started = true;
		addEventListener('keydown', event => this.#keyboard(event));
		addEventListener('keyup', event => this.#keyboard(event));
		addEventListener('blur', () => this.#release());
		this.#frame = requestAnimationFrame(() => this.#pollGamepad());
	}

	static #activeCore() {
		return !!document.querySelector('ion-page#core, ion-content.core');
	}

	static #editable(target) {
		const element = /** @type {HTMLElement} */ (target);
		const tag = element?.tagName?.toLowerCase();
		return element?.isContentEditable || ['input', 'select', 'textarea'].includes(tag);
	}

	static #keyboard(event) {
		if (this.#activeCore() || this.#editable(event.target))
			return;

		const action = this.#KEYS[event.code];
		if (!action)
			return;

		event.preventDefault();

		if (event.type == 'keyup') {
			this.#pressed[action] = false;
			return;
		}

		if (!event.repeat || ['up', 'down', 'left', 'right'].includes(action))
			this.#act(action);
	}

	static #pollGamepad() {
		const pad = [...navigator.getGamepads?.() ?? []].find(value => value?.connected);
		if (!this.#activeCore() && pad) {
			const pressed = (index) => !!pad.buttons[index]?.pressed;
			const axis = (index) => Math.abs(pad.axes[index] ?? 0) > 0.5 ? pad.axes[index] : 0;

			this.#gamepad('accept', pressed(1));
			this.#gamepad('back', pressed(0));
			this.#gamepad('previous-tab', pressed(4));
			this.#gamepad('next-tab', pressed(5));
			this.#gamepad('up', pressed(12) || axis(1) < 0);
			this.#gamepad('down', pressed(13) || axis(1) > 0);
			this.#gamepad('left', pressed(14) || axis(0) < 0);
			this.#gamepad('right', pressed(15) || axis(0) > 0);
		} else {
			this.#release();
		}

		this.#frame = requestAnimationFrame(() => this.#pollGamepad());
	}

	static #gamepad(action, pressed) {
		const now = performance.now();
		const repeatAt = this.#repeat[action] ?? 0;

		if (!pressed) {
			this.#held[action] = false;
			this.#repeat[action] = 0;
			return;
		}

		if (!this.#held[action] || now >= repeatAt) {
			this.#act(action);
			this.#repeat[action] = now + (this.#held[action] ? 140 : 420);
		}

		this.#held[action] = true;
	}

	static #release() {
		this.#pressed = {};
		this.#held = {};
		this.#repeat = {};
	}

	static #act(action) {
		switch (action) {
			case 'accept':
				this.#accept();
				break;
			case 'back':
				Navigation.back();
				break;
			case 'previous-tab':
				this.#tab(-1);
				break;
			case 'next-tab':
				this.#tab(1);
				break;
			default:
				this.#move(action);
				break;
		}
	}

	static #focusables() {
		return [...document.querySelectorAll(this.#SELECTOR)]
			.filter(element => !element.closest('ion-page#core, ion-content.core'))
			.filter(element => {
				const style = getComputedStyle(element);
				const rect = element.getBoundingClientRect();
				return style.visibility != 'hidden' && style.display != 'none' && rect.width > 0 && rect.height > 0;
			});
	}

	static #current(items) {
		return items.includes(document.activeElement) ? document.activeElement : null;
	}

	static #default(items) {
		const content = [...document.querySelectorAll('ion-content:not(.core)')]
			.find(element => {
				const rect = element.getBoundingClientRect();
				return rect.width > 0 && rect.height > 0;
			});

		return items.find(item => content?.contains(item)) ?? items[0];
	}

	static #focus(element) {
		if (!element)
			return;

		if (document.activeElement != element)
			document.activeElement?.blur?.();

		this.#focused?.classList?.remove('gamejin-focus');
		this.#focused = element;
		this.#focused.classList?.add('gamejin-focus');
		element.focus?.();
		element.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
	}

	static #accept() {
		const items = this.#focusables();
		const current = this.#current(items) ?? this.#default(items);
		this.#focus(current);
		current?.click?.();
	}

	static #move(direction) {
		const items = this.#focusables();
		if (!items.length)
			return;

		const current = this.#current(items);
		if (!current) {
			this.#focus(this.#default(items));
			return;
		}

		const rect = current.getBoundingClientRect();
		const x = rect.left + rect.width / 2;
		const y = rect.top + rect.height / 2;
		const vertical = direction == 'up' || direction == 'down';
		const sign = direction == 'up' || direction == 'left' ? -1 : 1;

		const next = items
			.filter(item => item != current)
			.map(item => {
				const itemRect = item.getBoundingClientRect();
				const itemX = itemRect.left + itemRect.width / 2;
				const itemY = itemRect.top + itemRect.height / 2;
				const primary = vertical ? itemY - y : itemX - x;
				const secondary = vertical ? Math.abs(itemX - x) : Math.abs(itemY - y);
				return { item, primary, score: Math.abs(primary) + secondary * 2 };
			})
			.filter(candidate => candidate.primary * sign > 8)
			.sort((left, right) => left.score - right.score)[0]?.item;

		this.#focus(next ?? current);
	}

	static #tab(offset) {
		const tabs = [...document.querySelectorAll('ion-tab-button')];
		if (!tabs.length)
			return;

		const selected = tabs.findIndex(tab => tab.classList.contains('tab-selected') || tab.getAttribute('aria-selected') == 'true');
		const focused = tabs.indexOf(document.activeElement);
		const current = selected >= 0 ? selected : Math.max(focused, 0);
		const next = tabs[(current + offset + tabs.length) % tabs.length];

		this.#focused?.classList?.remove('gamejin-focus');
		this.#focused = null;
		document.activeElement?.blur?.();
		next.click();
	}
}
