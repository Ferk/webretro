import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonImg, IonLoading, IonPage, IonProgressBar, IonTitle, IonToolbar, useIonAlert, useIonModal, useIonViewWillEnter } from '@ionic/react';
import { cloudDownloadOutline, imageOutline, informationCircleOutline, playOutline, refreshOutline } from 'ionicons/icons';
import { useRef, useState } from 'react';
import { CoreModal } from '../modals/core-modal';
import { Game } from '../entities/game';
import { System } from '../entities/system';
import Files from '../services/files';
import Navigation from '../services/navigation';
import Path from '../services/path';
import Requests from '../services/requests';
import { useToast } from '../hooks/toast';

const encodePath = (path) => path.split('/').map(encodeURIComponent).join('/');

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
	const prefix = `games/${encodeURIComponent(system.name)}/`;
	const base = encodePath(stripExtension(game.rom));
	const rom = encodePath(game.rom);

	return [
		`${prefix}${base}.png`,
		`${prefix}${base}.jpg`,
		`${prefix}${base}.jpeg`,
		`${prefix}${base}.webp`,
		`${prefix}${rom}.png`,
		`${prefix}${rom}.jpg`,
		`${prefix}${rom}.jpeg`,
		`${prefix}${rom}.webp`,
	];
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
	return left.name.localeCompare(right.name);
});

/**
 * @param {Object} parameters
 * @param {System} parameters.system
 * @param {Game} parameters.game
 * @param {{ system: string, game: string, progress: number }} parameters.status
 * @param {(system: System, game: Game) => void} parameters.select
 * @returns {JSX.Element}
 */
const GameTile = ({ system, game, status, select }) => {
	const [index, setIndex] = useState(0);
	const thumbnails = thumbnailCandidates(system, game);
	const downloading = status.system == system.name && status.game == game.rom;
	const available = game.installed || game.builtin;

	return (
		<button className={`game-tile ${available ? '' : 'available'}`} onClick={() => select(system, game)} disabled={!!status.game && !downloading}>
			<span className="game-thumb">
				{index < thumbnails.length ?
					<IonImg src={thumbnails[index]} onIonError={() => setIndex(index + 1)} alt="" /> :
					<IonIcon icon={imageOutline} />
				}
			</span>
			<span className="game-meta">
				<span className="game-name">{Path.clean(game.name)}</span>
				<span className="game-action">
					{downloading ? <IonProgressBar value={status.progress} /> :
						<IonIcon icon={available ? playOutline : cloudDownloadOutline} />
					}
				</span>
			</span>
		</button>
	);
};

/**
 * @returns {JSX.Element}
 */
export const HomePage = () => {
	const modal = useRef(/** @type {() => void} */ (null));

	const [systems, setSystems] = useState(/** @type {System[]} */ ([]));
	const [system,  setSystem]  = useState(/** @type {System}   */ (null));
	const [game,    setGame]    = useState(/** @type {Game}     */ (null));
	const [loading, setLoading] = useState(/** @type {boolean}  */ (false));
	const [status,  setStatus]  = useState({ system: null, game: null, progress: 0 });

	const [alert] = useIonAlert();
	const [start, stop] = useIonModal(CoreModal, { system, game, close: () => closeGame() });

	const version = window.gamejin_build.split('-')[0];
	const build = window.gamejin_build.split('-')[1];
	const date = new Date(build * 1000).toUTCString();
	const [present] = useToast(`Gamejin - ${version} (${build})`);

	const update = async () => {
		setSystems(await Requests.getSystems());
	};

	const closeGame = () => {
		modal.current?.();
		modal.current = null;
		stop();
	};

	const play = (system, game) => {
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
		try {
			const response = await fetch(`games/${encodeURIComponent(system.name)}/${encodePath(game.rom)}`);
			if (!response.ok)
				throw new Error(`Download failed: ${response.status} ${response.statusText}`);
			if (!response.body)
				throw new Error('Download failed: response has no body');

			await read(system, game.rom, response.body, response.headers.get('Content-Length'));
		} catch (error) {
			console.error(error);
			alert({ header: 'Install failed', message: error.message ?? game.rom, buttons: [ 'OK' ] });
		}

		setStatus({ system: null, game: null, progress: 0 });
		await update();
	};

	const select = (system, game) => {
		if (game.installed || game.builtin) {
			play(system, game);
			return;
		}

		download(system, game);
	};

	const refreshLibrary = async () => {
		setLoading(true);
		await Requests.refreshLibrary()
		await update();
		setLoading(false);
	}

	useIonViewWillEnter(update);

	return (
		<IonPage className="page">

			<IonHeader>
				<IonToolbar>
					<IonTitle>Games</IonTitle>
					<IonButtons slot="end">
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
									<GameTile key={`${system.name}/${game.rom}`} system={system} game={game} status={status} select={select} />
								)}
							</div>
						</section>
					)}
				</div>
			</IonContent>

		</IonPage>
	);
};
