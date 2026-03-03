import { Exercise } from "./interfaces/exercise";
import { PopupState } from "./interfaces/exercise-popup";

export interface AppState {
    readonly exercise: Exercise[];
    readonly exercisePopup: PopupState;
}
