import { InputButton, InputMessage, InputTouch } from '../entities/input';

export default class Input {
	/** @type {Touch[]} */
	#touches = {};

	/** @type {boolean} */
	#pressed = {};

	/** @type {{[key: number]: boolean}} */
	#gamepad = {};

	/**
	 * @param {DOMRect} rect
	 * @param {number} x
	 * @param {number} y
	 * @returns {number}
	 */
	#distance(rect, x, y) {
		const center_x = rect.left + rect.width  / 2;
		const center_y = rect.top  + rect.height / 2;
		const dist_x = Math.max(Math.abs(x - center_x) - rect.width  / 2, 0);
		const dist_y = Math.max(Math.abs(y - center_y) - rect.height / 2, 0);
		return Math.sqrt(Math.pow(dist_x, 2) + Math.pow(dist_y, 2));
	}

	/**
	 * @param {InputTouch} touch
	 * @param {InputButton[]} buttons
	 * @returns {InputMessage[]}
	 */
	press(touch, buttons) {
		const messages = [];

		const button = buttons.reduce((value, current) => {
			const curr_dist = this.#distance(current.rect, touch.x, touch.y);
			if (!value)
				return curr_dist < 25 ? current : null;

			const prev_dist = this.#distance(value.rect, touch.x, touch.y);
			if (prev_dist > 25 && curr_dist > 25)
				return null;

			return curr_dist < prev_dist ? current : value;
		}, /** @type {InputButton} */ (null));

		const prev_touch = this.#touches[touch.id];
		if (prev_touch && prev_touch.id != button?.id)
			messages.push({ device: Input.Device.JOYPAD, id: prev_touch.id, value: false });

		const start = !!['mousedown', 'touchstart'].find(type => type == touch.type);
		const move = !!['mousemove', 'touchmove'].find(type => type == touch.type);
		const pressed = start || (move && prev_touch && prev_touch.pressed);

		if (button) {
			messages.push({ device: Input.Device.JOYPAD, id: button.id, value: pressed });
			this.#touches[touch.id] = { id: button.id, pressed };

		} else {
			delete this.#touches[touch.id];
		}

		return messages;
	}

	/**
	 * @param {InputTouch} touch
	 * @param {DOMRect} canvas
	 * @param {number} width
	 * @param {number} height
	 * @returns {InputMessage[]}
	 */
	touch(touch, canvas, width, height) {
		const scaled_x = (touch.x - canvas.left) / (canvas.right  - canvas.left) * width;
		const scaled_y = (touch.y - canvas.top ) / (canvas.bottom - canvas.top ) * height;

		const start = !!['mousedown', 'touchstart'].find(t => t == touch.type);
		const move = !!['mousemove', 'touchmove'].find(t => t == touch.type);
		const pressed = start || (move && this.#pressed);
		this.#pressed = pressed;

		return [
			{ device: Input.Device.POINTER, id: Input.Pointer.X,       value: scaled_x },
			{ device: Input.Device.POINTER, id: Input.Pointer.Y,       value: scaled_y },
			{ device: Input.Device.POINTER, id: Input.Pointer.PRESSED, value: pressed  },
			{ device: Input.Device.POINTER, id: Input.Pointer.COUNT,   value: 1        },
		];
	}

	/**
	 * @returns {InputMessage[]}
	 */
	gamepad() {
		const pads = navigator.getGamepads?.() ?? [];
		const pad = [...pads].find(value => value?.connected);
		const state = {};

		if (pad) {
			const pressed = (index) => !!pad.buttons[index]?.pressed;
			const axis = (index) => Math.abs(pad.axes[index] ?? 0) > 0.5 ? pad.axes[index] : 0;

			state[Input.Joypad.B]      = pressed(0);
			state[Input.Joypad.A]      = pressed(1);
			state[Input.Joypad.Y]      = pressed(2);
			state[Input.Joypad.X]      = pressed(3);
			state[Input.Joypad.L]      = pressed(4);
			state[Input.Joypad.R]      = pressed(5);
			state[Input.Joypad.SELECT] = pressed(8);
			state[Input.Joypad.START]  = pressed(9);
			state[Input.Joypad.UP]     = pressed(12) || axis(1) < 0;
			state[Input.Joypad.DOWN]   = pressed(13) || axis(1) > 0;
			state[Input.Joypad.LEFT]   = pressed(14) || axis(0) < 0;
			state[Input.Joypad.RIGHT]  = pressed(15) || axis(0) > 0;
		}

		const messages = [];
		for (const id of Input.Joypad.ALL) {
			const value = !!state[id];
			if (this.#gamepad[id] != value) {
				messages.push({ device: Input.Device.JOYPAD, id, value });
				this.#gamepad[id] = value;
			}
		}

		return messages;
	}

	static Device = class {
		static get JOYPAD()  { return 1; }
		static get POINTER() { return 6; }
	}

	static Joypad = class {
		static get B()      { return 0;  }
		static get Y()      { return 1;  }
		static get SELECT() { return 2;  }
		static get START()  { return 3;  }
		static get UP()     { return 4;  }
		static get DOWN()   { return 5;  }
		static get LEFT()   { return 6;  }
		static get RIGHT()  { return 7;  }
		static get A()      { return 8;  }
		static get X()      { return 9;  }
		static get L()      { return 10; }
		static get R()      { return 11; }

		static get ALL() {
			return [
				this.B, this.Y, this.SELECT, this.START,
				this.UP, this.DOWN, this.LEFT, this.RIGHT,
				this.A, this.X, this.L, this.R,
			];
		}
	}

	static Pointer = class {
		static get X()       { return 0; }
		static get Y()       { return 1; }
		static get PRESSED() { return 2; }
		static get COUNT()   { return 3; }
	}
}
