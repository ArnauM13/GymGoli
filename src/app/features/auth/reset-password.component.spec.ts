import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ResetPasswordComponent } from './reset-password.component';
import { AuthService } from '../../core/services/auth.service';

describe('ResetPasswordComponent', () => {
  let component: ResetPasswordComponent;
  let mockUpdatePassword: jasmine.Spy;
  let mockNavigate:       jasmine.Spy;

  beforeEach(async () => {
    mockUpdatePassword = jasmine.createSpy('updatePassword').and.returnValue(Promise.resolve());
    mockNavigate       = jasmine.createSpy('navigate').and.returnValue(Promise.resolve(true));

    await TestBed.configureTestingModule({
      imports: [ResetPasswordComponent],
      providers: [
        {
          provide: AuthService,
          useValue: { updatePassword: mockUpdatePassword },
        },
        {
          provide: Router,
          useValue: { navigate: mockNavigate },
        },
        {
          provide: MatSnackBar,
          useValue: { open: jasmine.createSpy('open') },
        },
      ],
    })
      .overrideComponent(ResetPasswordComponent, {
        set: { imports: [], schemas: [NO_ERRORS_SCHEMA] },
      })
      .compileComponents();

    const fixture = TestBed.createComponent(ResetPasswordComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('starts with loading=false, success=false, error=""', () => {
    expect(component.loading()).toBeFalse();
    expect(component.success()).toBeFalse();
    expect(component.error()).toBe('');
  });

  // ── submit() ─────────────────────────────────────────────────────────────

  describe('submit()', () => {
    it('sets error when password is shorter than 6 characters', async () => {
      component.password        = '12345';
      component.passwordConfirm = '12345';
      await component.submit();
      expect(component.error()).toContain('6 caràcters');
      expect(mockUpdatePassword).not.toHaveBeenCalled();
    });

    it('sets error when passwords do not match', async () => {
      component.password        = 'password123';
      component.passwordConfirm = 'password456';
      await component.submit();
      expect(component.error()).toContain('no coincideixen');
      expect(mockUpdatePassword).not.toHaveBeenCalled();
    });

    it('clears previous error on each submit attempt', async () => {
      component.password        = '12345';
      component.passwordConfirm = '12345';
      await component.submit(); // sets error

      component.password        = 'newpassword';
      component.passwordConfirm = 'newpassword';
      await component.submit(); // error should be cleared before validation
      expect(component.error()).toBe('');
    });

    it('calls authService.updatePassword with the new password', async () => {
      component.password        = 'password123';
      component.passwordConfirm = 'password123';
      await component.submit();
      expect(mockUpdatePassword).toHaveBeenCalledWith('password123');
    });

    it('sets success=true after successful password update', async () => {
      component.password        = 'password123';
      component.passwordConfirm = 'password123';
      await component.submit();
      expect(component.success()).toBeTrue();
    });

    it('sets error message when updatePassword throws', async () => {
      mockUpdatePassword.and.returnValue(Promise.reject(new Error('Auth error')));
      component.password        = 'password123';
      component.passwordConfirm = 'password123';
      await component.submit();
      expect(component.error()).toContain('Auth error');
      expect(component.success()).toBeFalse();
    });

    it('uses fallback error message when error has no message', async () => {
      mockUpdatePassword.and.returnValue(Promise.reject({}));
      component.password        = 'password123';
      component.passwordConfirm = 'password123';
      await component.submit();
      expect(component.error()).toBeTruthy();
    });

    it('resets loading to false after success', async () => {
      component.password        = 'password123';
      component.passwordConfirm = 'password123';
      await component.submit();
      expect(component.loading()).toBeFalse();
    });

    it('resets loading to false on error', async () => {
      mockUpdatePassword.and.returnValue(Promise.reject(new Error('fail')));
      component.password        = 'password123';
      component.passwordConfirm = 'password123';
      await component.submit();
      expect(component.loading()).toBeFalse();
    });
  });

  // ── goToLogin() ──────────────────────────────────────────────────────────

  describe('goToLogin()', () => {
    it('navigates to /login', () => {
      component.goToLogin();
      expect(mockNavigate).toHaveBeenCalledWith(['/login']);
    });
  });
});
