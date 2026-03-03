import { createReducer, on } from '@ngrx/store';
import * as PopupActions from './exercise-popup.actions';
import { PopupState } from '../../interfaces/exercise-popup';

export const initialState: PopupState = {
  isOpen: false
};

export const exercisePopupReducer = createReducer(
  initialState,
  on(PopupActions.openPopup, state => ({ ...state, isOpen: true })),
  on(PopupActions.closePopup, state => ({ ...state, isOpen: false }))
);
