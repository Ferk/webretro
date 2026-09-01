import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonImg, IonLoading, IonPage, IonProgressBar, IonTitle, IonToolbar, useIonAlert, useIonModal, useIonViewWillEnter } from '@ionic/react';
import { addOutline, closeOutline, cloudDownloadOutline, imageOutline, informationCircleOutline, playOutline, refreshOutline } from 'ionicons/icons';
import { useEffect, useRef, useState } from 'react';
import { AddGamesModal } from '../modals/add-games-modal';
import { CoreModal } from '../modals/core-modal';
import { Game } from '../entities/game';
import { System } from '../entities/system';
import Files from '../services/files';
import Navigation from '../services/navigation';
import Path from '../services/path';
import Requests from '../services/requests';
import { useToast } from '../hooks/toast';

const encodePath = (path) => path.split('/').map(encodeURIComponent).join('/');

const gameUrl = (system, game) => {
	const source = game.source ?? `${system.name}/${game.rom}`;
	return /^https?:\/\//i.test(source) ? source : `games/${encodePath(source)}`;
};

const sourceParts = (system, game) => {
	const source = game.source ?? `${system.name}/${game.rom}`;

	if (/^https?:\/\//i.test(source)) {
		const url = new URL(source);
		const filename = decodeURIComponent(url.pathname.slice(url.pathname.lastIndexOf('/') + 1));
		return {
			remote: true,
			directory: source.slice(0, source.lastIndexOf('/') + 1),
			filename,
		};
	}

	return {
		remote: false,
		directory: source.includes('/') ? `${source.slice(0, source.lastIndexOf('/'))}/` : '',
		filename: source.includes('/') ? source.slice(source.lastIndexOf('/') + 1) : source,
	};
};

const deepLinkPath = (value) => {
	try {
		return decodeURIComponent(value)
			.replace(/^\.\//, '')
			.replace(/^games\//i, '')
			.replace(/\\/g, '/')
			.toLowerCase();
	} catch {
		return value.toLowerCase();
	}
};

const isHttpUrl = (value) => /^https?:\/\//i.test(value);

/**
 * @param {string} rom
 * @returns {string}
 */
const stripExtension = (rom) => rom.replace(/\.[^/.]+$/, '');

/**
 * @param {System} system
 * @param {Game} game
 * @returns {string[]}
 */
const thumbnailCandidates = (system, game) => {
	const source = sourceParts(system, game);
	const prefix = source.remote ? source.directory : `games/${encodePath(source.directory)}`;
	const url = (name) => source.remote ? new URL(encodeURIComponent(name), prefix).href : `${prefix}${encodeURIComponent(name)}`;
	const base = stripExtension(source.filename);

	return [
		url(`${base}.png`),
		url(`${base}.jpg`),
		url(`${base}.jpeg`),
		url(`${base}.webp`),
		url(`${source.filename}.png`),
		url(`${source.filename}.jpg`),
		url(`${source.filename}.jpeg`),
		url(`${source.filename}.webp`),
	];
};

const formatSize = (size) => {
	if (!Number.isFinite(size) || size <= 0)
		return null;

	const units = ['B', 'KB', 'MB', 'GB'];
	let value = size;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}

	return `${value.toFixed(unit ? 1 : 0)} ${units[unit]}`;
};

const fieldLabel = (key) => key
	.replace(/[-_]+/g, ' ')
	.replace(/\b\w/g, letter => letter.toUpperCase());

const linkedFields = new Set(['website', 'trailer']);

const fieldValue = (key, value) => {
	if (!linkedFields.has(key) || !/^https?:\/\//i.test(value))
		return value;

	return <a href={value} target="_blank" rel="noreferrer">{value}</a>;
};

/**
 * @param {Game[]} games
 * @returns {Game[]}
 */
const sortGames = (games) => [...games].sort((left, right) => {
	if (left.installed != right.installed)
		return left.installed ? -1 : 1;
	if (left.builtin != right.builtin)
		return left.builtin ? -1 : 1;
	return left.title.localeCompare(right.title);
});

/**
 * @param {Object} parameters
 * @param {System} parameters.system
 * @param {Game} parameters.game
 * @param {{ system: string, game: string, progress: number }} parameters.status
 * @param {(system: System, game: Game) => void} parameters.open
 * @param {(system: System, game: Game) => void} parameters.action
 * @returns {JSX.Element}
 */
const GameTile = ({ system, game, status, open, action }) => {
	const [index, setIndex] = useState(0);
	const thumbnails = thumbnailCandidates(system, game);
	const downloading = status.system == system.name && status.game == game.rom;
	const available = game.installed || game.builtin;

	return (
		<div className={`game-tile ${available ? '' : 'available'}`}>
			<button className="game-tile-main" onClick={() => open(system, game)} disabled={!!status.game && !downloading}>
				<span className="game-thumb">
					{index < thumbnails.length ?
						<IonImg src={thumbnails[index]} onIonError={() => setIndex(index + 1)} alt="" /> :
						<IonIcon icon={imageOutline} />
					}
				</span>
			</button>
			<span className="game-meta">
				<button className="game-name" onClick={() => open(system, game)} disabled={!!status.game && !downloading} tabIndex={-1}>
					{Path.clean(game.title)}
				</button>
				{downloading ? <IonProgressBar value={status.progress} /> :
					<button className="game-action-button" onClick={() => action(system, game)} disabled={!!status.game}
							tabIndex={-1} aria-label={`${available ? 'Play' : 'Download'} ${Path.clean(game.title)}`}>
						<IonIcon icon={available ? playOutline : cloudDownloadOutline} />
					</button>
				}
			</span>
		</div>
	);
};

const GameDetailsModal = ({ system, game, status, close, action }) => {
	const [index, setIndex] = useState(0);
	const primary = useRef(/** @type {HTMLButtonElement} */ (null));

	useEffect(() => {
		const timer = setTimeout(() => {
			primary.current?.focus?.();
			primary.current?.classList?.add('gamejin-focus');
		}, 80);
		return () => clearTimeout(timer);
	}, [game]);

	if (!system || !game)
		return null;

	const thumbnails = thumbnailCandidates(system, game);
	const available = game.installed || game.builtin;
	const downloading = status.system == system.name && status.game == game.rom;
	const platform = game.metadata?.platform || system.name;
	const fields = [
		['filename', 'Filename', game.rom],
		['size', 'File size', formatSize(game.size)],
		...Object.entries(game.metadata ?? {})
			.filter(([key]) => !['title', 'description', 'plot', 'platform'].includes(key.toLowerCase()))
			.map(([key, value]) => [key, fieldLabel(key), value]),
	].filter(([, , value]) => value);

	return (
		<IonPage className="game-details page">
			<IonHeader>
				<IonToolbar>
					<IonTitle>{Path.clean(game.title)}</IonTitle>
					<IonButtons slot="end">
						<IonButton onClick={close}>
							<IonIcon slot="icon-only" icon={closeOutline} />
						</IonButton>
					</IonButtons>
				</IonToolbar>
			</IonHeader>

			<IonContent>
				<div className="game-details-body">
					<div className="game-details-cover">
						{index < thumbnails.length ?
							<IonImg src={thumbnails[index]} onIonError={() => setIndex(index + 1)} alt="" /> :
							<IonIcon icon={imageOutline} />
						}
					</div>

					<div className="game-details-info">
						<h2>{Path.clean(game.title)}</h2>
						<p className="game-details-platform">{platform}</p>
						{game.metadata?.plot && <p className="game-details-plot">{game.metadata.plot}</p>}
						<dl>
							{fields.map(([key, label, value]) => (
								<div key={label}>
									<dt>{label}</dt>
									<dd>{fieldValue(key, value)}</dd>
								</div>
							))}
						</dl>
					</div>
				</div>
			</IonContent>

			<div className="game-details-actions">
				<button ref={primary} className="game-details-primary" data-gamejin-default onClick={() => action(system, game)} disabled={downloading}>
					{downloading ? <IonProgressBar value={status.progress} /> :
						<>
							<IonIcon icon={available ? playOutline : cloudDownloadOutline} />
							{available ? 'Play' : 'Download'}
						</>
					}
				</button>
			</div>
		</IonPage>
	);
};

/**
 * @returns {JSX.Element}
 */
export const HomePage = () => {
	const modal = useRef(/** @type {() => void} */ (null));
	const details = useRef(/** @type {() => void} */ (null));
	const addGames = useRef(/** @type {() => void} */ (null));
	const deepLinkHandled = useRef(false);
	const deepLinkResolving = useRef(false);

	const [systems, setSystems] = useState(/** @type {System[]} */ ([]));
	const [system,  setSystem]  = useState(/** @type {System}   */ (null));
	const [game,    setGame]    = useState(/** @type {Game}     */ (null));
	const [detailsSystem, setDetailsSystem] = useState(/** @type {System} */ (null));
	const [detailsGame,   setDetailsGame]   = useState(/** @type {Game}   */ (null));
	const [loading, setLoading] = useState(/** @type {boolean}  */ (false));
	const [status,  setStatus]  = useState({ system: null, game: null, progress: 0 });

	const [alert] = useIonAlert();
	const [start, stop] = useIonModal(CoreModal, { system, game, close: () => closeGame() });
	const [showDetails, hideDetails] = useIonModal(GameDetailsModal, {
		system: detailsSystem,
		game: detailsGame,
		status,
		close: () => closeDetails(),
		action: (system, game) => runGameAction(system, game),
	});
	const [showAddGames, hideAddGames] = useIonModal(AddGamesModal, {
		systems,
		close: () => closeAddGames(),
		update: () => update(),
	});

	const version = window.gamejin_build.split('-')[0];
	const build = window.gamejin_build.split('-')[1];
	const date = new Date(build * 1000).toUTCString();
	const [present] = useToast(`Gamejin - ${version} (${build})`);

	const update = async () => {
		const availableSystems = await Requests.getSystems();
		setSystems(availableSystems);
		return availableSystems;
	};

	const clearGameLink = () => {
		const url = new URL(location.href);
		url.searchParams.delete('d');
		history.replaceState(history.state, '', url);
	};

	const closeGame = () => {
		if (Navigation.closing)
			clearGameLink();
		else if (modal.current)
			addEventListener('popstate', clearGameLink, { once: true });
		else
			clearGameLink();

		modal.current?.();
		modal.current = null;
		stop();
		setSystem(null);
		setGame(null);
	};

	const closeDetails = (clearLink = true) => {
		if (clearLink) {
			if (Navigation.closing)
				clearGameLink();
			else if (details.current)
				addEventListener('popstate', clearGameLink, { once: true });
			else
				clearGameLink();
		}

		details.current?.();
		details.current = null;
		hideDetails();
		setDetailsSystem(null);
		setDetailsGame(null);
	};

	const closeAddGames = () => {
		addGames.current?.();
		addGames.current = null;
		hideAddGames();
	};

	const play = (system, game) => {
		closeDetails(false);
		setSystem(system);
		setGame(game);
		start({ cssClass: 'fullscreen' });
		modal.current = Navigation.push(closeGame);
	};

	const read = async (system, rom, stream, length) => {
		setStatus({ system: system.name, game: rom, progress: 0 });

		const data = await Requests.readStream(stream, length, progress => {
			setStatus({ system: system.name, game: rom, progress });
		});

		if (!data) {
			alert({ header: 'Install failed', message: rom, buttons: [ 'OK' ] });
			return false;
		}

		await Files.Games.add(system.name, rom, data);
		return true;
	};

	const download = async (system, game) => {
		let installed = false;

		try {
			const response = await fetch(gameUrl(system, game));
			if (!response.ok)
				throw new Error(`Download failed: ${response.status} ${response.statusText}`);
			if (!response.body)
				throw new Error('Download failed: response has no body');

			installed = await read(system, game.rom, response.body, response.headers.get('Content-Length'));
		} catch (error) {
			console.error(error);
			alert({ header: 'Install failed', message: error.message ?? game.rom, buttons: [ 'OK' ] });
		}

		setStatus({ system: null, game: null, progress: 0 });
		await update();
		return installed;
	};

	const installDetailsGame = (system, game) => {
		const installed = new Game(system, game.rom, true, game.builtin, game.metadata, game.size, game.source);
		setDetailsGame(installed);
	};

	const runGameAction = async (system, game) => {
		if (game.installed || game.builtin) {
			play(system, game);
			return;
		}

		if (await download(system, game))
			installDetailsGame(system, game);
	};

	const openDetails = (system, game) => {
		setDetailsSystem(system);
		setDetailsGame(game);
		setTimeout(() => {
			showDetails({ cssClass: 'game-details-modal' });
			details.current = Navigation.push(closeDetails);
		});
	};

	const refreshLibrary = async () => {
		setLoading(true);
		await Requests.refreshLibrary()
		await update();
		setLoading(false);
	}

	const openAddGames = () => {
		showAddGames({ cssClass: 'add-games-modal' });
		addGames.current = Navigation.push(closeAddGames);
	};

	const findLinkedGame = (value, availableSystems) => {
		const path = deepLinkPath(value);
		const games = availableSystems.flatMap(candidate => candidate.games.map(candidateGame => ({
			system: candidate,
			game: candidateGame,
		})));
		const matches = games.filter(({ system: candidate, game: candidateGame }) => {
			const paths = [
				candidateGame.rom,
				candidateGame.source,
				gameUrl(candidate, candidateGame),
			].filter(Boolean).map(deepLinkPath);

			return paths.includes(path) || paths.some(candidatePath => candidatePath.endsWith(`/${path}`));
		});

		return matches.length == 1 ? matches[0] : null;
	};

	const scanLinkedGame = async (value, availableSystems) => {
		if (!isHttpUrl(value))
			return null;

		const manifest = await Requests.scanSource(value);
		const matches = Object.entries(manifest).flatMap(([platform, entries]) => {
			const candidate = availableSystems.find(item => item.name == platform);
			if (!candidate)
				return [];

			return entries.map(entry => {
				const game = typeof entry == 'string'
					? new Game(candidate, entry, false)
					: new Game(candidate, entry.rom, false, false, entry.metadata, entry.size, entry.source);
				return { system: candidate, game };
			});
		});

		return matches.length == 1 ? matches[0] : null;
	};

	const openDeepLink = async (value, availableSystems) => {
		try {
			const linked = findLinkedGame(value, availableSystems) ?? await scanLinkedGame(value, availableSystems);
			if (!linked) {
				clearGameLink();
				alert({ header: 'Game not found', message: value, buttons: ['OK'] });
				return;
			}

			openDetails(linked.system, linked.game);
			if (!linked.game.installed && !linked.game.builtin && await download(linked.system, linked.game))
				installDetailsGame(linked.system, linked.game);
		} catch (error) {
			console.error(error);
			clearGameLink();
			alert({ header: 'Game link failed', message: error.message ?? value, buttons: ['OK'] });
		} finally {
			deepLinkResolving.current = false;
		}
	};

	useEffect(() => {
		const value = new URLSearchParams(location.search).get('d');
		if (!value || deepLinkHandled.current)
			return;

		deepLinkHandled.current = true;
		deepLinkResolving.current = true;
		update().then(availableSystems => openDeepLink(value, availableSystems));
	}, []);

	useEffect(() => {
		const selectedSystem = detailsSystem ?? system;
		const selectedGame = detailsGame ?? game;
		const url = new URL(location.href);

		if (!selectedSystem && !selectedGame && deepLinkResolving.current)
			return;

		if (selectedSystem && selectedGame)
			url.searchParams.set('d', gameUrl(selectedSystem, selectedGame));
		else
			url.searchParams.delete('d');

		history.replaceState(history.state, '', url);
	}, [detailsSystem, detailsGame, system, game]);

	useIonViewWillEnter(update);

	return (
		<IonPage className="page">

			<IonHeader>
				<IonToolbar>
					<IonTitle>Games</IonTitle>
					<IonButtons slot="end">
						<IonButton onClick={openAddGames}>
							<IonIcon slot="icon-only" icon={addOutline} />
						</IonButton>
						<IonButton onClick={() => present(date)}>
							<IonIcon slot="icon-only" icon={informationCircleOutline} />
						</IonButton>
						<IonButton onClick={refreshLibrary}>
							<IonIcon slot="icon-only" icon={refreshOutline} />
						</IonButton>
					</IonButtons>
				</IonToolbar>
			</IonHeader>

			<IonContent className="games">
				<IonLoading isOpen={loading} message="Refreshing..." spinner={null} />

				<div className="game-library">
					{systems.filter(system => system.games.length).map(system =>
						<section className="game-section" key={system.name}>
							<header>
								<div>
									<h2>{system.name}</h2>
									<p>{system.games.length} game{system.games.length > 1 && 's'}</p>
								</div>
							</header>
							<div className="game-grid">
								{sortGames(system.games).map(game =>
									<GameTile key={`${system.name}/${game.rom}`} system={system} game={game} status={status} open={openDetails} action={runGameAction} />
								)}
							</div>
						</section>
					)}
				</div>
			</IonContent>

		</IonPage>
	);
};
