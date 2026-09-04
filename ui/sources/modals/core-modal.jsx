import { IonAccordion, IonAccordionGroup, IonButton, IonButtons, IonCheckbox, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonMenu, IonMenuButton, IonPage, IonSegment, IonSegmentButton, IonSelect, IonSelectOption, IonTitle, IonToolbar, useIonAlert } from '@ionic/react';
import { useEffect, useRef, useState } from 'react';
import { checkmarkOutline } from 'ionicons/icons';
import { useSize } from '../hooks/size';
import { useCore } from '../hooks/core';
import { InputButton, InputTouch } from '../entities/input';
import { System } from '../entities/system';
import { Game } from '../entities/game';
import { Variable } from '../entities/variable';
import { Settings } from '../entities/settings';
import { Cheat } from '../entities/cheat';
import Input from '../services/input';
import AudioPlayer from '../services/audio';

/**
 * @param {Object} parameters
 * @param {Variable[]} parameters.variables
 * @param {Settings} parameters.settings
 * @param {(key: string, value: string) => void} parameters.update
 * @returns {JSX.Element}
 */
const SettingsView = ({ variables, settings, update }) => {
	if (!variables?.length)
		return null;

	return (
		<IonAccordion>
			<IonItem slot="header" lines="none">
				<IonLabel>Settings</IonLabel>
			</IonItem>
			<IonList slot="content" lines="none">
				{variables.map(item =>
					<IonItem key={item.key}>
						<IonSelect label={item.name} interface="action-sheet" labelPlacement="floating"
								value={settings?.[item.key] ?? item.options[0]}
								onIonChange={e => update(item.key, e.detail.value)}>
							{item.options.map(option => (
								<IonSelectOption key={option} value={option}>{option}</IonSelectOption>)
							)}
						</IonSelect>
					</IonItem>
				)}
			</IonList>
		</IonAccordion>
	);
}

/**
 * @param {Object} parameters
 * @param {Cheat[]} parameters.cheats
 * @returns {JSX.Element}
 */
const CheatsView = ({ cheats }) => {
	if (!cheats?.length)
		return null;

	return (
		<IonAccordion>
			<IonItem slot="header" lines="none">
				<IonLabel>Cheats</IonLabel>
			</IonItem>
			<IonList slot="content" lines="none">
				{cheats.map(item =>
					<IonItem key={item.name}>
						<IonLabel>{item.name} ({item.order})</IonLabel>
						{item.enabled && <IonIcon icon={checkmarkOutline} color="primary"></IonIcon>}
					</IonItem>
				)}
			</IonList>
		</IonAccordion>
	);
}

/**
 * @param {unknown} error
 * @returns {{ header: string, message: string }}
 */
const explainStartupError = (error) => {
	const message = error?.message || String(error);

	if (message.includes('Cross-Origin-Opener-Policy') || message.includes('Cross-Origin-Embedder-Policy') || message.includes('Browser isolation')) {
		return {
			header: 'Browser isolation is required',
			message: 'Start the local preview with the Gamejin server, then reload this page.',
		};
	}

	if (message.includes('SharedArrayBuffer')) {
		return {
			header: 'Shared memory is unavailable',
			message: 'Reload after the service worker is active, or serve Gamejin with COOP/COEP headers.',
		};
	}

	return {
		header: 'Game could not start',
		message,
	};
}

/**
 * @param {Object} parameters
 * @param {string} parameters.name
 * @param {number} parameters.id
 * @param {('generic' | 'arrow' | 'shoulder' | 'special')} parameters.type
 * @param {{top: number, right: number, bottom: number, left: number}} parameters.inset
 * @returns {JSX.Element}
 */
const Control = ({ name, id, type, inset }) => {
	const unit = window.innerWidth < window.innerHeight ? 'vw' : 'vh'

	const style = {
		top:      `min(${inset.top}${unit},    ${inset.top    * 10}px)`,
		right:    `min(${inset.right}${unit},  ${inset.right  * 10}px)`,
		bottom:   `min(${inset.bottom}${unit}, ${inset.bottom * 10}px)`,
		left:     `min(${inset.left}${unit},   ${inset.left   * 10}px)`,
		fontSize: `min(5${unit}, 5 * 10px)`,
	};

	switch (type) {
		case 'generic':
			style.width = `min(12${unit}, 12 * 10px)`;
			style.height = `min(12${unit}, 12 * 10px)`;
			style.borderRadius = '50%';
			break;
		case 'arrow':
			style.width = `min(12${unit}, 12 * 10px)`;
			style.height = `min(12${unit}, 12 * 10px)`;
			style.borderRadius = '10%';
			break;
		case 'shoulder':
			style.width = `min(12${unit}, 12 * 10px)`;
			style.height = `min(8${unit}, 8 * 10px)`;
			style.borderRadius = '20%';
			break;
		case 'special':
			style.width = `min(8${unit}, 8 * 10px)`;
			style.height = `min(8${unit}, 8 * 10px)`;
			style.borderRadius = '50%';
			break;
	}

	return <button style={style} data-id={id}>{name}</button>;
}

const hasTouchInput = () => navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;

/**
 * @param {Object} parameters
 * @param {System} parameters.system
 * @param {Game} parameters.game
 * @param {() => void} parameters.close
 * @returns {JSX.Element}
 */
export const CoreModal = ({ system, game, close }) => {
	// Ionic may update modal props while it is dismissing. A running core must
	// keep the system and game it was started with until its cleanup completes.
	const [{ system: activeSystem, game: activeGame }] = useState(() => ({ system, game }));
	const content = useRef(/** @type {HTMLIonContentElement} */ (null));
	const canvas  = useRef(/** @type {HTMLCanvasElement}     */ (null));
	const menu = useRef(/** @type {HTMLIonMenuElement}       */ (null));
	const hardware = useRef(new Input());
	const menuOpen = useRef(false);
	const mouseCaptured = useRef(false);
	const releasingPointerLock = useRef(false);
	const paused = useRef(false);

	const [core, audio, speed, inputMode] = useCore(activeSystem.lib_name);
	const activeInputMode = useRef(inputMode.value);
	activeInputMode.current = inputMode.value;
	const [autoOverlay, setAutoOverlay] = useState(hasTouchInput);
	const [window_w, window_h] = useSize({ current: document.body });
	const [canvas_w, canvas_h] = useSize(canvas);
	const overlay = inputMode.value == 'overlay' || (inputMode.value == 'auto' && autoOverlay);

	const [alert] = useIonAlert();

	/** @returns {void} */
	const resize = () => {
		const rect = content.current.getBoundingClientRect();

		const window_ratio = (rect.right - rect.left) / (rect.bottom - rect.top);
		const canvas_ratio = canvas.current.width / canvas.current.height;

		if (window_ratio < canvas_ratio) {
			canvas.current.style.width  = '100%';
			canvas.current.style.height = null;

		} else {
			canvas.current.style.width  = null;
			canvas.current.style.height = '100%';
		}
	};

	/** @param {Event} event @returns {void} */
	const touch = (event) => {
		const touches =
			event.type.startsWith('mouse') ? [new InputTouch(event.type, event)] :
			event.type.startsWith('touch') ? [...event.changedTouches].map(touch => new InputTouch(event.type, touch)):
			[];

		const buttons = [...event.target.children].map(button => new InputButton(button));
		const rect = canvas.current.getBoundingClientRect();
		const width = canvas.current.width;
		const height = canvas.current.height;

		if (inputMode.value == 'auto' && event.type == 'touchstart')
			setAutoOverlay(true);

		if (inputMode.value == 'direct') {
			if (event.type == 'mousedown')
				requestMouseCapture();
			return;
		}

		overlay
			? core.current.press(touches, buttons)
			: core.current.touch(touches[0], rect, width, height);
	}

	/** @param {EventTarget} target @returns {boolean} */
	const isEditable = (target) => {
		const element = /** @type {HTMLElement} */ (target);
		const tag = element?.tagName?.toLowerCase();
		return element?.isContentEditable || ['input', 'select', 'textarea'].includes(tag);
	}

	/** @param {KeyboardEvent} event @returns {void} */
	const keyboard = (event) => {
		if (event.code == 'Escape') {
			event.preventDefault();
			event.stopImmediatePropagation();
			menu.current?.toggle();
			return;
		}

		if (menuOpen.current)
			return;

		if (isEditable(event.target))
			return;

		if (inputMode.value == 'auto' && event.type == 'keydown')
			setAutoOverlay(false);

		const messages = inputMode.value == 'direct'
			? hardware.current.directKeyboard(event)
			: hardware.current.keyboard(event);
		if (messages.length)
			core.current.input(messages);
	}

	/** @returns {void} */
	const releaseKeyboard = () => {
		const messages = [
			...hardware.current.releaseKeyboard(),
			...hardware.current.releaseDirectKeyboard(),
		];
		if (messages.length)
			core.current.input(messages);
	}

	/** @param {string} mode @returns {void} */
	const syncPause = (mode = activeInputMode.current) => {
		const shouldPause = menuOpen.current || (mode == 'direct' && !mouseCaptured.current);
		if (paused.current == shouldPause)
			return;

		paused.current = shouldPause;
		releaseKeyboard();
		core.current?.pause(shouldPause);
		shouldPause ? AudioPlayer.pause() : AudioPlayer.resume();
	}

	/** @returns {void} */
	const requestMouseCapture = (mode = activeInputMode.current) => {
		if (mode != 'direct' || menuOpen.current || mouseCaptured.current)
			return;

		const request = canvas.current?.requestPointerLock?.();
		request?.catch?.(() => syncPause());
	}

	/** @param {boolean} paused @returns {void} */
	const setPaused = (paused) => {
		menuOpen.current = paused;
		if (paused && document.pointerLockElement == canvas.current) {
			releasingPointerLock.current = true;
			document.exitPointerLock();
		}
		syncPause();

		if (!paused)
			requestMouseCapture();
	}

	/** @param {CustomEvent} event @returns {void} */
	const setInputMode = (event) => {
		const mode = event.detail.value;
		activeInputMode.current = mode;
		inputMode.set(mode);

		if (mode == 'direct') {
			mouseCaptured.current = document.pointerLockElement == canvas.current;
			syncPause(mode);
			return;
		}

		if (document.pointerLockElement == canvas.current)
			document.exitPointerLock();
		mouseCaptured.current = false;
		syncPause(mode);
	}

	/** @returns {void} */
	const save = () => alert('Current state will be saved.', [
		{ text: 'Confirm', handler: () => core.current.save() },
		{ text: 'Cancel' },
	]);

	/** @returns {void} */
	const restore = () => alert('Saved state will be restored.', [
		{ text: 'Confirm', handler: () => core.current.restore() },
		{ text: 'Cancel' },
	]);

	useEffect(() => {
		(async () => {
			try {
				await core.init(activeSystem.name, activeGame.rom, activeSystem.contentRequired, canvas.current, activeSystem.hardwareRendering).then(() => resize());
				paused.current = null;
				syncPause();
			} catch (e) {
				console.error(e);
				const error = explainStartupError(e);
				alert({
					header: error.header,
					message: error.message,
					buttons: [ 'OK' ],
				})
				core.current?.stop(); close();
			}
		})()

		return () => core.current.stop();
	}, []);

	useEffect(() => {
		content.current.addEventListener('touchstart',  (e) => e.preventDefault());
		content.current.addEventListener('touchmove',   (e) => e.preventDefault());
		content.current.addEventListener('touchend',    (e) => e.preventDefault());
		content.current.addEventListener('touchcancel', (e) => e.preventDefault());
	}, [content?.current]);

	useEffect(() => {
		/** @param {MouseEvent | PointerEvent} event @returns {void} */
		const mouse = (event) => {
			if (inputMode.value != 'direct' || menuOpen.current || !mouseCaptured.current)
				return;

			const rect = canvas.current.getBoundingClientRect();
			const messages = hardware.current.mouse(event, rect, canvas.current.width, canvas.current.height);
			if (messages.length)
				core.current.input(messages);
		};

		// Pointer Lock retargets input to the locked element. Listen at the window
		// so relative pointer movement reaches the core across browser implementations.
		addEventListener('pointermove', mouse, true);
		addEventListener('pointerdown', mouse, true);
		addEventListener('pointerup', mouse, true);

		return () => {
			removeEventListener('pointermove', mouse, true);
			removeEventListener('pointerdown', mouse, true);
			removeEventListener('pointerup', mouse, true);
		};
	}, [inputMode.value]);

	useEffect(() => {
		if (inputMode.value == 'auto')
			setAutoOverlay(hasTouchInput());

		if (inputMode.value != 'direct') {
			if (document.pointerLockElement == canvas.current)
				document.exitPointerLock();
			mouseCaptured.current = false;
		}
		syncPause();
	}, [inputMode.value]);

	useEffect(() => {
		const pointerLockChanged = () => {
			const captured = document.pointerLockElement == canvas.current;
			const expectedRelease = releasingPointerLock.current;
			mouseCaptured.current = captured;
			releasingPointerLock.current = false;
			syncPause();

			if (!captured && !expectedRelease && !menuOpen.current && activeInputMode.current == 'direct')
				menu.current?.open();
		};

		document.addEventListener('pointerlockchange', pointerLockChanged);
		return () => document.removeEventListener('pointerlockchange', pointerLockChanged);
	}, []);

	useEffect(() => {
		let frame = 0;
		let stopped = false;

		const poll = () => {
			const messages = hardware.current.gamepad();

			if (inputMode.value == 'auto' && messages.some(message => message.value))
				setAutoOverlay(false);

			if (messages.length && inputMode.value != 'direct')
				core.current.input(messages);

			if (!stopped)
				frame = requestAnimationFrame(poll);
		};

		frame = requestAnimationFrame(poll);

		return () => {
			stopped = true;
			cancelAnimationFrame(frame);
		};
	}, [inputMode.value]);

	useEffect(() => {
		addEventListener('keydown', keyboard, true);
		addEventListener('keyup', keyboard);
		addEventListener('blur', releaseKeyboard);

		return () => {
			removeEventListener('keydown', keyboard, true);
			removeEventListener('keyup', keyboard);
			removeEventListener('blur', releaseKeyboard);
		};
	}, [inputMode.value]);

	useEffect(() => resize(), [core.current?.aspect_ratio, window_w, window_h, canvas_w, canvas_h]);

	return (
		<>
			<IonMenu ref={menu} menuId="core-settings" className="core-settings" contentId="core" side="start" swipeGesture={false}
				onIonWillOpen={() => setPaused(true)} onIonDidClose={() => setPaused(false)}>
				<IonHeader>
					<IonToolbar>
						<IonTitle>Settings</IonTitle>
					</IonToolbar>
				</IonHeader>

				<IonContent>
					<IonList lines="none">
						<IonItem>
							<IonButton fill="outline" onClick={() => save()}>Save state</IonButton>
							<IonButton fill="outline" onClick={() => restore()}>Restore state</IonButton>
						</IonItem>
						<IonSegment value={speed.value} onIonChange={e => speed.set(e.detail.value)}>
							<IonSegmentButton value={1}><IonLabel>1x</IonLabel></IonSegmentButton>
							<IonSegmentButton value={2}><IonLabel>2x</IonLabel></IonSegmentButton>
							<IonSegmentButton value={4}><IonLabel>4x</IonLabel></IonSegmentButton>
						</IonSegment>
						<IonItem>
							<IonCheckbox checked={audio.value} onIonChange={e => audio.set(e.detail.checked)}>Enable audio</IonCheckbox>
						</IonItem>
						<IonItem>
							<IonSelect label="Input mode" interface="action-sheet" value={inputMode.value}
								onIonChange={setInputMode}>
								<IonSelectOption value="auto">Auto</IonSelectOption>
								<IonSelectOption value="overlay">Gamepad overlay</IonSelectOption>
								<IonSelectOption value="keyboard">Gamepad Keyboard</IonSelectOption>
								{activeSystem.directKeyboardMouse &&
									<IonSelectOption value="direct">Direct Keyboard/Mouse</IonSelectOption>}
							</IonSelect>
						</IonItem>
						<IonAccordionGroup>
							<SettingsView variables={core.variables} settings={core.settings} update={core.update}></SettingsView>
							<CheatsView cheats={core.cheats}></CheatsView>
						</IonAccordionGroup>
					</IonList>
				</IonContent>
			</IonMenu>

			<IonPage id="core">
				<IonHeader>
					<IonToolbar>
						<IonButtons slot="start">
							<IonMenuButton></IonMenuButton>
						</IonButtons>
						<IonTitle>{activeSystem.name}</IonTitle>
						<IonButtons slot="end">
							<IonButton onClick={close}>Close</IonButton>
						</IonButtons>
					</IonToolbar>
				</IonHeader>

				<IonContent ref={content} className="core"
					onMouseDown={touch} onMouseMove={touch} onMouseUp={touch}
					onTouchStart={touch} onTouchMove={touch} onTouchEnd={touch} onTouchCancel={touch}>
					<canvas ref={canvas} />

					{overlay && <div className="controls"><div>
						<Control name="A"        device={Input.Device.JOYPAD} id={Input.Joypad.A}     type='generic'  inset={{bottom: 30, right: 4 }} />
						<Control name="B"        device={Input.Device.JOYPAD} id={Input.Joypad.B}     type='generic'  inset={{bottom: 18, right: 16}} />
						<Control name="X"        device={Input.Device.JOYPAD} id={Input.Joypad.X}     type='generic'  inset={{bottom: 42, right: 16}} />
						<Control name="Y"        device={Input.Device.JOYPAD} id={Input.Joypad.Y}     type='generic'  inset={{bottom: 30, right: 28}} />
						<Control name="R"        device={Input.Device.JOYPAD} id={Input.Joypad.R}     type='shoulder' inset={{bottom: 48, right: 34}} />
						<Control name="&#x00B7;" device={Input.Device.JOYPAD} id={Input.Joypad.START} type='special'  inset={{bottom: 18, right: 37}} />

						<Control name="&#x140A;" device={Input.Device.JOYPAD} id={Input.Joypad.LEFT}   type='arrow'    inset={{bottom: 30, left: 4 }} />
						<Control name="&#x1401;" device={Input.Device.JOYPAD} id={Input.Joypad.DOWN}   type='arrow'    inset={{bottom: 18, left: 16}} />
						<Control name="&#x1403;" device={Input.Device.JOYPAD} id={Input.Joypad.UP}     type='arrow'    inset={{bottom: 42, left: 16}} />
						<Control name="&#x1405;" device={Input.Device.JOYPAD} id={Input.Joypad.RIGHT}  type='arrow'    inset={{bottom: 30, left: 28}} />
						<Control name="L"        device={Input.Device.JOYPAD} id={Input.Joypad.L}      type='shoulder' inset={{bottom: 48, left: 34}} />
						<Control name="&#x00B7;" device={Input.Device.JOYPAD} id={Input.Joypad.SELECT} type='special'  inset={{bottom: 18, left: 37}} />
					</div></div>}
				</IonContent>
			</IonPage>
		</>
	);
}
