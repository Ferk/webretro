import { IonButton, IonButtons, IonCard, IonCardHeader, IonCardSubtitle, IonCardTitle, IonContent, IonHeader, IonIcon, IonPage, IonTitle, IonToolbar, useIonModal, useIonViewWillEnter } from '@ionic/react';
import { useRef, useState } from 'react';
import { GamesModal } from '../modals/games-modal';
import { System } from '../entities/system';
import Requests from '../services/requests';
import Navigation from '../services/navigation';
import { refreshOutline } from 'ionicons/icons';

/**
 * @returns {JSX.Element}
 */
export const CoresPage = () => {
	const [systems, setSystems] = useState(/** @type {System[]} */ ([]));
	const [system,  setSystem]  = useState(/** @type {System}   */ (null));
	const modal = useRef(/** @type {() => void} */ (null));

	const closeModal = async () => {
		modal.current?.();
		modal.current = null;
		setSystems(await Requests.getSystems());
		close();
	};

	const [open, close] = useIonModal(GamesModal, { system, close: closeModal });

	/**
	 * @param {System} system
	 * @returns {void}
	 */
	const showModal = (system) => {
		setSystem(system);
		open({ cssClass: 'fullscreen' });
		modal.current = Navigation.push(closeModal);
	}

	const refreshLibrary = async () => {
		await Requests.refreshLibrary()
		setSystems(await Requests.getSystems());
	}

	useIonViewWillEnter(async () => {
		setSystems(await Requests.getSystems());
	});

	return (
		<IonPage className="page">

			<IonHeader>
				<IonToolbar>
					<IonTitle>Cores</IonTitle>
					<IonButtons slot="end">
						<IonButton onClick={refreshLibrary}>
							<IonIcon slot="icon-only" icon={refreshOutline} />
						</IonButton>
					</IonButtons>
				</IonToolbar>
			</IonHeader>

			<IonContent className="cores">
				{systems.map(system =>
					<IonCard key={system.name} onClick={() => showModal(system)}>
						<IonCardHeader>
							<IonCardTitle>{system.name}</IonCardTitle>
							<IonCardSubtitle>{system.core_name} - {system.games.length} game{system.games.length > 1 && 's'}</IonCardSubtitle>
						</IonCardHeader>
					</IonCard>
				)}
			</IonContent>

		</IonPage>
	);
};
