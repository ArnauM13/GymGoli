import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExercisePopupComponent } from './exercise-popup.component';

describe('ExercisePopupComponent', () => {
  let component: ExercisePopupComponent;
  let fixture: ComponentFixture<ExercisePopupComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ExercisePopupComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ExercisePopupComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
