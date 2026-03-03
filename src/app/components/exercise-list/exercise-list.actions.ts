import { createAction, props } from "@ngrx/store";
import { Exercise } from "../../interfaces/exercise";

export const LoadExercises = createAction('[Exercise] Load Exercises', props<{exerciseData: Exercise[]}>());
export const AddExercise = createAction('[Exercise] Add Exercise', props<Exercise>());
export const UpdateExercise = createAction('[Exercise] Update Exercise', props<Exercise>());