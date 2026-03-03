import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MainPageComponent } from './pages/main-page/main-page.component';
import { TrainingPageComponent } from './pages/training-page/training-page.component';

const routes: Routes = [
  {path: '', component: MainPageComponent},
  {path: 'currentTraining', component: TrainingPageComponent},
  {path: '**', redirectTo: '/'}
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
