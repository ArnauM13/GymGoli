import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { MainPageComponent } from './pages/main-page/main-page.component';
import { ExerciseListComponent } from './components/exercise-list/component/exercise-list.component';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MatCardModule } from '@angular/material/card';
import { FlexLayoutModule } from '@angular/flex-layout';
import { TrainingPageComponent } from './pages/training-page/training-page.component';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { NavBarComponent } from './shared/nav-bar/nav-bar.component';
import { ExercisePopupComponent } from './components/exercise-popup/component/exercise-popup.component';
import { StoreModule } from '@ngrx/store';
import { AppState } from './app-state';
import { exerciseReducer } from './components/exercise-list/exercise-list.reducer';
import { exercisePopupReducer } from './components/exercise-popup/exercise-popup.reducer';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ExerciseEffects } from './components/exercise-list/exercise-list.effects';
import { EffectsModule } from '@ngrx/effects';
import { MatSidenavModule } from '@angular/material/sidenav';

@NgModule({
  declarations: [
    AppComponent,
    MainPageComponent,
    ExerciseListComponent,
    TrainingPageComponent,
    NavBarComponent,
    ExercisePopupComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    MatCardModule,
    FlexLayoutModule,
    MatButtonModule,
    MatToolbarModule,
    MatIconModule,
    MatFormFieldModule,
    FormsModule,
    ReactiveFormsModule,
    MatSidenavModule,
    StoreModule.forRoot<AppState>({
      exercise: exerciseReducer,
      exercisePopup: exercisePopupReducer
    }),
    EffectsModule.forRoot([ExerciseEffects])
  ],
  providers: [
    provideAnimationsAsync()
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
