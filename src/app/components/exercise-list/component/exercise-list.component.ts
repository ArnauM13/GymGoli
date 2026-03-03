import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { Store, select } from '@ngrx/store';
import { Exercise } from '../../../interfaces/exercise';
import * as ExercisePopupActions from '../../exercise-popup/exercise-popup.actions';
import { AppState } from '../../../app-state';
import { ExerciseListService } from '../service/exercise-list.service';

@Component({
  selector: 'exercise-list-comp',
  templateUrl: './exercise-list.component.html',
  styleUrl: './exercise-list.component.scss'
})
export class ExerciseListComponent implements OnInit, OnDestroy {

  exercises: Exercise[] = [];
  exercisesValueSubscription: Subscription;
  isExercisePopupOpen: boolean = false;
  exercisePopupSubcription: Subscription;
  selectedExercise!: Exercise;

  constructor (
    private store: Store<AppState>,
    private exerciseListService: ExerciseListService
  ) {
    this.exercisePopupSubcription = this.store.pipe(select('exercisePopup')).subscribe((state) => this.isExercisePopupOpen = state.isOpen);
    this.exercisesValueSubscription = this.store.pipe(select('exercise')).subscribe((state) => this.exercises = state);
  }

  ngOnInit(): void {
    this.exerciseListService.initApp();
  }

  openPopup(exercise: Exercise) {
    this.selectedExercise = exercise;
    this.store.dispatch(ExercisePopupActions.openPopup());
  }

  getProgressSrc(currentWeight: number, lastWeight: number): string {
    if (currentWeight > lastWeight) {
      return '../../../assets/fletxa_verda.png'
    } else if (currentWeight < lastWeight) {
      return '../../../assets/fletxa_vermella.png'
    } else {
      return ''
    }
  }

  ngOnDestroy(): void {
    this.exercisePopupSubcription.unsubscribe();
    this.exercisesValueSubscription.unsubscribe();
  }
  
}
