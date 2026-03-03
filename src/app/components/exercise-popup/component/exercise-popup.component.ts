import { Component, Input, OnInit } from '@angular/core';
import { Store, select } from '@ngrx/store';
import { FormBuilder, FormGroup } from '@angular/forms';

import { AppState } from '../../../app-state';
import { Exercise } from '../../../interfaces/exercise';
import * as ExercisePopupActions from '../exercise-popup.actions';
import * as ExerciseListActions from '../../exercise-list/exercise-list.actions';
import { Subscription } from 'rxjs';

@Component({
  selector: 'exercise-popup-comp',
  templateUrl: './exercise-popup.component.html',
  styleUrl: './exercise-popup.component.scss'
})
export class ExercisePopupComponent implements OnInit {

  @Input() selectedExercise!: Exercise;
  exerciseForm!: FormGroup;

  exercises: Exercise[] = [];
  exercisesValueSubscription: Subscription;
  
  constructor(
    private store: Store<AppState>,
    private formBuilder: FormBuilder
  ) {
    this.exercisesValueSubscription = this.store.pipe(select('exercise')).subscribe((state) => this.exercises = state);
  }

  ngOnInit(): void {
    this.exerciseForm = this.formBuilder.group({
      weight: [this.selectedExercise.weight],
      reps: [this.selectedExercise.reps],
      series: [this.selectedExercise.series]
    })  }

  setLiked(liked: boolean) {
    // this.exerciseForm.get('liked')?.setValue(liked);
  }

  closePopup() {
    this.store.dispatch(ExercisePopupActions.closePopup());
  }

  updateExercise() {
    const { weight, reps, series } = this.exerciseForm.value;
    const updatedExercise: Exercise = {
      ...this.selectedExercise,
      id: this.selectedExercise.id,
      lastWeight: this.selectedExercise.weight,
      weight,
      reps,
      series
    }
    this.store.dispatch(ExerciseListActions.UpdateExercise(updatedExercise))
    this.closePopup();
  }

}
