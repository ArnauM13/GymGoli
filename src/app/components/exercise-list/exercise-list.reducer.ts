import { createReducer, on } from "@ngrx/store";
import { Exercise } from "../../interfaces/exercise";
import { AddExercise, LoadExercises, UpdateExercise } from "./exercise-list.actions";

const initialState: Exercise[] = []

export const exerciseReducer = createReducer(
    initialState,
    on(LoadExercises, (state, {exerciseData}) =>
        [...state, ...exerciseData]
    ),
    on(AddExercise, (state, exercise) =>
        [...state, exercise]
    ),
    on(UpdateExercise, (state, updatedExercise) =>
        state.map(exercise => exercise.id === updatedExercise.id ? updatedExercise : exercise)
    )
);