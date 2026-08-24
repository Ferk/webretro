import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonPage, IonTitle, IonToolbar, useIonAlert } from '@ionic/react';
import { closeOutline, cloudDownloadOutline, cloudUploadOutline, pencilOutline, refreshOutline, saveOutline, trashOutline } from 'ionicons/icons';
import { useEffect, useRef, useState } from 'react';
import { System } from '../entities/system';
import Files from '../services/files';
import Requests from '../services/requests';

const manifestPlatform = (manifest) => {
	const platforms = Object.entries(manifest ?? {}).filter(([, games]) => games.length);
	return platforms.length == 1 && platforms[0][1].length == 1 ? platforms[0][0] : null;
};

const sourceInfo = (source, syncing) => {
	if (source.builtin)
		return 'Default collection';
	if (syncing && source.games == null)
		return 'Synchronizing...';
	if (source.games == null)
		return 'Not synchronized yet';
	return `${source.games} game${source.games == 1 ? '' : 's'}`;
};

/**
 * @param {Object} parameters
 * @param {System[]} parameters.systems
 * @param {() => void} parameters.close
 * @param {() => Promise<void>} parameters.update
 * @returns {JSX.Element}
 */
export const AddGamesModal = ({ systems, close, update }) => {
	const input = useRef(/** @type {HTMLInputElement} */ (null));
	const [alert] = useIonAlert();

	const [file, setFile] = useState(/** @type {File} */ (null));
	const [availableSystems, setAvailableSystems] = useState(systems);
	const [sources, setSources] = useState([]);
	const [editing, setEditing] = useState(-1);
	const [url, setUrl] = useState('');
	const [busy, setBusy] = useState(false);
	const [syncing, setSyncing] = useState(false);
	const repositories = [{ url: 'games/', builtin: true }, ...sources];

	const reload = async () => {
		setSources(await Files.Sources.get());
		setAvailableSystems(await Requests.getSystems());
	};

	useEffect(() => {
		reload();
	}, []);

	const detectSystem = (name) => {
		const lower = name.toLowerCase();
		return availableSystems.filter(system => system.extensions.some(extension => lower.endsWith(extension.toLowerCase())));
	};

	const selectFile = (event) => {
		const selected = event.target.files?.[0] ?? null;
		setFile(selected);
	};

	const installFile = async () => {
		try {
			if (!file)
				return;

			setBusy(true);
			const matches = detectSystem(file.name);
			if (matches.length != 1)
				throw new Error(`Could not detect a platform for ${file.name}.`);

			const data = new Uint8Array(await file.arrayBuffer());
			await Files.Games.add(matches[0].name, file.name, data);
			setFile(null);
			input.current.value = '';
			await update();
		} catch (error) {
			console.error(error);
			alert({ header: 'Add failed', message: error.message ?? file.name, buttons: ['OK'] });
		} finally {
			setBusy(false);
		}
	};

	const installUrl = async (sourceUrl, response, manifest) => {
		const filename = decodeURIComponent(new URL(sourceUrl).pathname.split('/').pop());
		const selected = manifestPlatform(manifest);

		if (!selected)
			throw new Error(`Could not detect a platform for ${filename}.`);

		const data = new Uint8Array(await response.arrayBuffer());
		await Files.Games.add(selected, filename, data);
		setUrl('');
		await update();
	};

	const resetSource = () => {
		setEditing(-1);
		setUrl('');
	};

	const synchronize = async () => {
		setSyncing(true);
		try {
			await Requests.refreshLibrary();
			const current = await Files.Sources.get();
			const counted = await Promise.all(current.map(async source => {
				try {
					return {
						...source,
						games: await Requests.countSource(source.url),
					};
				} catch (error) {
					console.error(error);
					return {
						...source,
						games: null,
					};
				}
			}));
			await Files.Sources.update(counted);
			setSources(counted);
			await reload();
			await update();
		} catch (error) {
			console.error(error);
			alert({ header: 'Sync failed', message: error.message ?? 'Could not refresh game collections.', buttons: ['OK'] });
		} finally {
			setSyncing(false);
		}
	};

	const editSource = (index) => {
		const source = sources[index];
		setEditing(index);
		setUrl(source.url);
	};

	const addFromUrl = async () => {
		try {
			setBusy(true);
			const sourceUrl = new URL(url).href;
			const source = await Requests.sourceType(sourceUrl);

			if (!source.collection) {
				const manifest = await Requests.scanSource(sourceUrl);
				await installUrl(sourceUrl, source.response, manifest);
				resetSource();
				return;
			}

			const next = [...sources];
			const entry = {
				url: sourceUrl,
				games: null,
			};

			if (editing >= 0)
				next[editing] = entry;
			else
				next.push(entry);

			await Files.Sources.update(next);
			setSources(next);
			resetSource();
			synchronize();
		} catch (error) {
			console.error(error);
			alert({ header: 'Add failed', message: error.message ?? url, buttons: ['OK'] });
		} finally {
			setBusy(false);
		}
	};

	const removeSource = async (index) => {
		const next = sources.filter((_, current) => current != index);
		await Files.Sources.update(next);
		setSources(next);
		if (editing == index)
			resetSource();
		synchronize();
	};

	const refresh = async () => {
		synchronize();
	};

	return (
		<IonPage className="page add-games">
			<IonHeader>
				<IonToolbar>
					<IonTitle>Add Games</IonTitle>
					<IonButtons slot="end">
						<IonButton onClick={close}>
							<IonIcon slot="icon-only" icon={closeOutline} />
						</IonButton>
					</IonButtons>
				</IonToolbar>
			</IonHeader>

			<IonContent>
				<section className="add-games-section">
					<h2>File or URL</h2>
					<input ref={input} type="file" onChange={selectFile} hidden />
					<IonButton onClick={() => input.current?.click()} fill="outline">
						<IonIcon slot="start" icon={cloudUploadOutline} />
						Choose File
					</IonButton>
					<IonItem color="transparent">
						<IonInput label="URL" type="url" value={url} onIonInput={event => setUrl(event.detail.value)} />
					</IonItem>
					{file &&
						<>
							<IonItem color="transparent">
								<IonLabel>{file.name}</IonLabel>
							</IonItem>
							<IonButton onClick={installFile} disabled={busy}>
								<IonIcon slot="start" icon={saveOutline} />
								Install
							</IonButton>
						</>
					}
					{url.trim() &&
						<IonButton onClick={addFromUrl} disabled={busy}>
							<IonIcon slot="start" icon={cloudDownloadOutline} />
							{editing >= 0 ? 'Update Collection' : 'Add URL'}
						</IonButton>
					}
				</section>

				<section className="add-games-section">
					<h2>Game Collections</h2>
					<div className="add-games-actions">
						{editing >= 0 &&
							<IonButton onClick={resetSource} fill="clear">Cancel</IonButton>
						}
						<IonButton onClick={refresh} disabled={busy || syncing} fill="clear">
							<IonIcon slot="start" icon={refreshOutline} />
							{syncing ? 'Syncing' : 'Refresh'}
						</IonButton>
					</div>
					{syncing &&
						<IonItem color="transparent">
							<IonLabel>Synchronizing game collections...</IonLabel>
						</IonItem>
					}

					<IonList lines="none">
						{repositories.map((source, index) => (
							<IonItem key={source.url} color="transparent">
								<IonLabel>
									<h3>{source.builtin ? 'Bundled games' : source.url}</h3>
									<p>{sourceInfo(source, syncing)}</p>
								</IonLabel>
								{!source.builtin &&
									<>
										<IonButton onClick={() => editSource(index - 1)} disabled={busy} fill="clear">
											<IonIcon slot="icon-only" icon={pencilOutline} />
										</IonButton>
										<IonButton onClick={() => removeSource(index - 1)} disabled={busy} fill="clear">
											<IonIcon slot="icon-only" icon={trashOutline} color="medium" />
										</IonButton>
									</>
								}
							</IonItem>
						))}
					</IonList>
				</section>
			</IonContent>
		</IonPage>
	);
};
