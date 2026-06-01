import { Store } from "@tauri-apps/plugin-store";
import { ISessionRepository } from "../infrastructure/ports/ISessionRepository";
import { ICaptureRepository } from "../infrastructure/ports/ICaptureRepository";
import { IDriftEventRepository } from "../infrastructure/ports/IDriftEventRepository";
import { INotificationService } from "../infrastructure/ports/INotificationService";
import { IConfigRepository } from "../infrastructure/ports/IConfigRepository";
import { IOverlayManager } from "../infrastructure/ports/IOverlayManager";
import { IDialogService } from "../infrastructure/ports/IDialogService";
import { TauriStoreSessionRepository } from "../infrastructure/persistence/tauri-store/TauriStoreSessionRepository";
import { TauriStoreCaptureRepository } from "../infrastructure/persistence/tauri-store/TauriStoreCaptureRepository";
import { TauriStoreDriftEventRepository } from "../infrastructure/persistence/tauri-store/TauriStoreDriftEventRepository";
import { TauriNotificationAdapter } from "../infrastructure/notifications/TauriNotificationAdapter";
import { FileSystemConfigRepository } from "../infrastructure/persistence/filesystem/FileSystemConfigRepository";
import { TauriOverlayManager } from "../infrastructure/adapters/TauriOverlayManager";
import { TauriDialogAdapter } from "../infrastructure/adapters/TauriDialogAdapter";
import { SessionService } from "./services/SessionService";
import { CaptureService } from "./services/CaptureService";
import { NotificationFacade } from "./services/NotificationFacade";
import { ConfigService } from "./services/ConfigService";
import { InterventionOrchestrator } from "./services/InterventionOrchestrator";
import { InterventionType } from "../domain/valueObjects/InterventionType";
import { IIntervention } from "../domain/interventions/IIntervention";
import { Compass } from "../domain/interventions/Compass";
import { Notification } from "../domain/interventions/Notification";
import { Stain } from "../domain/interventions/Stain";
import { CommitmentDialog } from "../domain/interventions/CommitmentDialog";

/**
 * Service Container - Dependency Injection Container
 *
 * Wires all services with their dependencies.
 * Provides single access point for all application services.
 *
 * Usage:
 *   const container = await ServiceContainer.initialize();
 *   const session = await container.sessionService.startSession(...)();
 */
export class ServiceContainer {
  // Infrastructure (private - not exposed)
  private readonly sessionRepo: ISessionRepository;
  private readonly captureRepo: ICaptureRepository;
  private readonly driftEventRepo: IDriftEventRepository;
  private readonly notificationService: INotificationService;
  private readonly configRepo: IConfigRepository;
  private readonly overlayManager: IOverlayManager;
  private readonly dialogService: IDialogService;

  // Application Services (public API)
  public readonly sessionService: SessionService;
  public readonly captureService: CaptureService;
  public readonly notificationFacade: NotificationFacade;
  public readonly configService: ConfigService;
  public readonly interventionOrchestrator: InterventionOrchestrator;

  private constructor(store: Store) {
    // Initialize infrastructure adapters
    this.sessionRepo = new TauriStoreSessionRepository(store);
    this.captureRepo = new TauriStoreCaptureRepository(store);
    this.driftEventRepo = new TauriStoreDriftEventRepository(store);
    this.notificationService = new TauriNotificationAdapter();
    this.configRepo = new FileSystemConfigRepository();
    this.overlayManager = new TauriOverlayManager();
    this.dialogService = new TauriDialogAdapter();

    // Create intervention registry
    const interventions = new Map<InterventionType, IIntervention>([
      ["compass", new Compass(this.overlayManager)],
      ["notification", new Notification(this.notificationService)],
      ["stain", new Stain(this.overlayManager)],
      ["dialog", new CommitmentDialog(this.dialogService)],
    ]);

    // Initialize application services with dependencies
    this.notificationFacade = new NotificationFacade(this.notificationService);
    this.configService = new ConfigService(this.configRepo);
    this.captureService = new CaptureService(this.captureRepo);
    this.interventionOrchestrator = new InterventionOrchestrator(
      interventions,
      this.overlayManager
    );
    this.sessionService = new SessionService(
      this.sessionRepo,
      this.driftEventRepo,
      this.interventionOrchestrator
    );
  }

  /**
   * Initialize the service container
   * Creates Tauri Store instance and wires all dependencies
   */
  static async initialize(): Promise<ServiceContainer> {
    // Initialize Tauri Store at ~/.keel/store.bin
    const store = await Store.load(".keel/store.bin");

    return new ServiceContainer(store);
  }

  /**
   * Initialize with custom implementations (for testing)
   */
  static createWithCustomDependencies(
    sessionRepo: ISessionRepository,
    captureRepo: ICaptureRepository,
    driftEventRepo: IDriftEventRepository,
    notificationService: INotificationService,
    configRepo: IConfigRepository,
    overlayManager?: IOverlayManager,
    dialogService?: IDialogService
  ): ServiceContainer {
    const container = Object.create(ServiceContainer.prototype);

    container.sessionRepo = sessionRepo;
    container.captureRepo = captureRepo;
    container.driftEventRepo = driftEventRepo;
    container.notificationService = notificationService;
    container.configRepo = configRepo;
    container.overlayManager = overlayManager ?? new TauriOverlayManager();
    container.dialogService = dialogService ?? new TauriDialogAdapter();

    // Create intervention registry
    const interventions = new Map<InterventionType, IIntervention>([
      ["compass", new Compass(container.overlayManager)],
      ["notification", new Notification(container.notificationService)],
      ["stain", new Stain(container.overlayManager)],
      ["dialog", new CommitmentDialog(container.dialogService)],
    ]);

    container.notificationFacade = new NotificationFacade(notificationService);
    container.configService = new ConfigService(configRepo);
    container.captureService = new CaptureService(captureRepo);
    container.interventionOrchestrator = new InterventionOrchestrator(
      interventions,
      container.overlayManager
    );
    container.sessionService = new SessionService(
      sessionRepo,
      driftEventRepo,
      container.interventionOrchestrator
    );

    return container;
  }
}
