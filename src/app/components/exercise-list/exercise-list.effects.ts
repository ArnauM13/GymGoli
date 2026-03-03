import { Injectable } from '@angular/core';
import { Actions, ofType, createEffect } from '@ngrx/effects';
import { map, tap } from 'rxjs/operators';

import { LoadExercises, UpdateExercise } from './exercise-list.actions';
import { Exercise } from '../../interfaces/exercise';

@Injectable()
export class ExerciseEffects {

    constructor(
        private actions$: Actions
    ) {}

    loadExercises$ = createEffect(() =>
        this.actions$.pipe(
            ofType(LoadExercises),
            map(({ exerciseData }) => {
                localStorage.setItem('exerciseData', JSON.stringify(exerciseData))
                return { type: 'Save Exercises to LocalStorage '}
            })
        ), { dispatch: false }
    );

    updateExercise$ = createEffect(() => 
        this.actions$.pipe(
            ofType(UpdateExercise),
            tap((payload) => {
                const localStorageData = localStorage.getItem('exerciseData');
                const { type, ...updatedExercise } = payload;
                if (localStorageData) {
                    const currentExercises = JSON.parse(localStorageData);
                    const updatedExercises = currentExercises.map((exercise : Exercise) => {
                        return exercise.id === updatedExercise.id ? updatedExercise : exercise;
                    })
                    localStorage.setItem('exerciseData', JSON.stringify(updatedExercises));
                }
                return { type: 'Updated Exercises to LocalStorage '}
            })
        ), { dispatch: false }
    );
}
