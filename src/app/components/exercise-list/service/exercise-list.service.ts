import { Injectable } from '@angular/core';
import { Exercise } from '../../../interfaces/exercise';
import { v4 as uuid } from 'uuid';
import { Store } from '@ngrx/store';
import { AppState } from '../../../app-state';
import { AddExercise, LoadExercises } from '../exercise-list.actions';

@Injectable({
  providedIn: 'root'
})
export class ExerciseListService {

  constructor(
    private store: Store<AppState>
  ) { }

  initApp() {
    const storedData = localStorage.getItem('exerciseData');
    let exerciseData: Exercise[] = [];
    
    if (storedData && storedData.length) {
      exerciseData = JSON.parse(storedData);
      this.store.dispatch(LoadExercises({exerciseData}));
    } else {
      exerciseData = [
        {
            id: uuid(),
            title: 'Press Banca',
            reps: 8,
            series: 4,
            icon: 'press_banca',
            weight: 70,
            lastWeight: 0,
            group: 'push'
        },
        {
            id: uuid(),
            title: "Dominades d'Esquena",
            reps: 8,
            series: 4,
            icon: 'dominades_esquena',
            weight: 0,
            lastWeight: 0,
            group: 'pull'
        },
        {
            id: uuid(),
            title: 'Dominades de Biceps',
            reps: 8,
            series: 4,
            icon: '',
            weight: 0,
            lastWeight: 0,
            group: 'pull'
        },
        {
            id: uuid(),
            title: 'Fondos de Triceps',
            reps: 8,
            series: 4,
            icon: '',
            weight: 0,
            lastWeight: 0,
            group: 'push'
        },
        {
            id: uuid(),
            title: 'Politges Espatlla',
            reps: 8,
            series: 4,
            icon: '',
            weight: 12,
            lastWeight: 14,
            group: 'push'
        }
      ];
      localStorage.setItem('exerciseData', JSON.stringify(exerciseData))
    }
  }

}