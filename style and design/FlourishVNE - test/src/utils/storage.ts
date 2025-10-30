import { VNID } from '../types';
import { VNProject } from '../types/project';


/**
 * NOTE: All functions that interacted with localStorage have been removed.
 * This change was made to prevent browser storage quota errors, which can
 * occur with large visual novel projects containing many assets.
 *
 * Project persistence is now handled exclusively through a manual
 * "Import/Export" workflow using .zip files. The application state is held
 * in memory during an editing session.
 */

export interface RecentProjectInfo {
    id: VNID;
    title: string;
    lastOpened: number;
}
