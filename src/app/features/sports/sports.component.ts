import { Component, computed, effect, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import { SportService } from '../../core/services/sport.service';
import { SPORT_CONFIG, SPORT_TYPES, SportType } from '../../core/models/sport.model';
import { CalendarComponent } from '../../shared/components/calendar/calendar.component';

const TODAY = (): string => new Date().toISOString().split('T')[0];

@Component({
  selector: 'app-sports',
  standalone: true,
  template: `
    <div class="page">

      <!-- ── Sport toggle cards ── -->
      <div class="sports-section">
        <p class="section-hint">Marca els esports que has practicat avui</p>

        <div class="sports-grid">
          @for (sport of sportList; track sport.type) {
            <button
              class="sport-card"
              [class.active]="isSportDone(sport.type)"
              [style.--sport-color]="sport.color"
              (click)="toggleSport(sport.type)"
              [disabled]="toggling()"
            >
              @if (isSportDone(sport.type)) {
                <span class="check-icon material-symbols-outlined">check_circle</span>
              }
              <span class="sport-icon material-symbols-outlined">{{ sport.icon }}</span>
              <span class="sport-name">{{ sport.label }}</span>
            </button>
          }
        </div>
      </div>

      <!-- ── Done summary ── -->
      @if (doneSports().length > 0) {
        <div class="done-summary">
          <span class="material-symbols-outlined done-icon">emoji_events</span>
          <span class="done-text">
            {{ doneSports().length === 1 ? '1 esport registrat' : doneSports().length + ' esports registrats' }}
          </span>
        </div>
      }

      <!-- ── Recent sessions list ── -->
      @if (recentSessions().length > 0) {
        <div class="recent-section">
          <h2 class="recent-title">Últimes sessions</h2>
          <div class="sessions-list">
            @for (group of recentGroups(); track group.date) {
              <div class="session-card">
                <div class="session-date-block">
                  <span class="session-day">{{ getDay(group.date) }}</span>
                  <span class="session-month">{{ getMonthYear(group.date) }}</span>
                </div>
                <div class="session-sports">
                  @for (sport of group.sports; track sport) {
                    <span class="sport-pill" [style.background]="getSportColor(sport)">
                      <span class="material-symbols-outlined pill-icon">{{ getSportIcon(sport) }}</span>
                      {{ getSportLabel(sport) }}
                    </span>
                  }
                </div>
              </div>
            }
          </div>
        </div>
      }

    </div>

    <!-- ── Date nav (floating pill, like train page) ── -->
    <div class="date-nav">
      <button class="arrow-btn" (click)="navigateDate(-1)">
        <span class="material-symbols-outlined">chevron_left</span>
      </button>

      <button class="date-btn" (click)="openCalendar()">
        <span class="date-text">{{ dateLabel() }}</span>
        <span class="material-symbols-outlined date-edit-icon">edit_calendar</span>
      </button>

      <button class="arrow-btn" [class.invisible]="isToday()" (click)="navigateDate(1)">
        <span class="material-symbols-outlined">chevron_right</span>
      </button>
    </div>
  `,
  styles: [`
    .page { padding: 16px 16px 160px; min-height: 100dvh; }

    /* ── Section hint ── */
    .section-hint {
      margin: 0 0 16px; font-size: 13px; color: #888; text-align: center;
    }

    /* ── Sports section ── */
    .sports-section { margin-bottom: 20px; }

    /* ── Sport grid: 3 columns ── */
    .sports-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }

    .sport-card {
      position: relative;
      display: flex; flex-direction: column; align-items: center; gap: 10px;
      padding: 24px 8px 20px;
      border: 2px solid color-mix(in srgb, var(--sport-color) 25%, #e0e0e0);
      border-radius: 20px;
      background: white;
      color: color-mix(in srgb, var(--sport-color) 70%, #333);
      cursor: pointer; touch-action: manipulation;
      transition: all 0.2s ease;
      font-size: inherit;

      &:hover:not(:disabled) {
        border-color: var(--sport-color);
        background: color-mix(in srgb, var(--sport-color) 6%, white);
        transform: translateY(-2px);
        box-shadow: 0 4px 16px color-mix(in srgb, var(--sport-color) 20%, transparent);
      }

      &:active:not(:disabled) { transform: scale(0.96); }

      &.active {
        border-color: var(--sport-color);
        background: color-mix(in srgb, var(--sport-color) 10%, white);
        box-shadow: 0 4px 16px color-mix(in srgb, var(--sport-color) 25%, transparent);
      }

      &:disabled { opacity: 0.7; cursor: default; }
    }

    .sport-icon {
      font-size: 36px;
      font-variation-settings: 'FILL' 0, 'wght' 300;
      transition: font-variation-settings 0.2s;
      .active & { font-variation-settings: 'FILL' 1, 'wght' 400; }
    }

    .sport-name {
      font-size: 13px; font-weight: 700; letter-spacing: 0.2px;
      text-align: center;
    }

    .check-icon {
      position: absolute; top: 8px; right: 8px;
      font-size: 18px;
      color: var(--sport-color);
      font-variation-settings: 'FILL' 1, 'wght' 500;
    }

    /* ── Done summary ── */
    .done-summary {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      padding: 12px 16px; margin-bottom: 20px;
      background: rgba(0,104,116,0.06); border-radius: 14px;
      color: #006874;
    }
    .done-icon { font-size: 20px; font-variation-settings: 'FILL' 1; }
    .done-text { font-size: 14px; font-weight: 600; }

    /* ── Recent sessions ── */
    .recent-section { }
    .recent-title {
      margin: 0 0 10px; font-size: 15px; font-weight: 700; color: #555;
      letter-spacing: 0.3px;
    }

    .sessions-list { display: flex; flex-direction: column; gap: 8px; }

    .session-card {
      display: flex; align-items: center; gap: 12px;
      background: white; border-radius: 14px;
      padding: 12px 14px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.07);
    }

    .session-date-block {
      display: flex; flex-direction: column; align-items: center;
      min-width: 38px; background: #f5f5f5; border-radius: 8px; padding: 5px 7px;
      flex-shrink: 0;
    }
    .session-day { font-size: 20px; font-weight: 700; color: #1a1a1a; line-height: 1; }
    .session-month { font-size: 10px; color: #888; text-transform: uppercase; margin-top: 2px; }

    .session-sports { display: flex; flex-wrap: wrap; gap: 6px; }

    .sport-pill {
      display: flex; align-items: center; gap: 4px;
      padding: 4px 10px; border-radius: 20px;
      font-size: 12px; font-weight: 600; color: white;
    }
    .pill-icon { font-size: 14px; font-variation-settings: 'FILL' 1; }

    /* ── Date nav ── */
    .date-nav {
      position: fixed;
      bottom: calc(64px + env(safe-area-inset-bottom) + 16px);
      left: 50%; transform: translateX(-50%);
      z-index: 90;
      display: flex; align-items: center;
      background: white;
      border-radius: 50px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15), 0 1px 4px rgba(0,0,0,0.08);
      padding: 4px;
      white-space: nowrap;
    }

    .arrow-btn {
      width: 40px; height: 40px; border-radius: 50%; border: none; background: transparent;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; color: #999; transition: color 0.15s, background 0.15s;
      touch-action: manipulation;
      .material-symbols-outlined { font-size: 22px; }
      &:hover { color: #333; background: rgba(0,0,0,0.06); }
      &.invisible { visibility: hidden; pointer-events: none; }
    }

    .date-btn {
      display: flex; align-items: center; gap: 6px;
      padding: 8px 14px; border-radius: 40px; border: none; background: transparent;
      cursor: pointer; touch-action: manipulation; transition: background 0.15s;
      &:hover { background: rgba(0,0,0,0.05); }
    }
    .date-text { font-size: 14px; font-weight: 600; color: #333; text-transform: capitalize; }
    .date-edit-icon { font-size: 15px; color: #bbb; }
  `],
})
export class SportsComponent {
  private sportService = inject(SportService);
  private dialog       = inject(MatDialog);
  private snackBar     = inject(MatSnackBar);

  readonly selectedDate = signal<string>(TODAY());
  readonly toggling     = signal(false);

  readonly isToday = computed(() => this.selectedDate() === TODAY());

  readonly dateLabel = computed(() => {
    const d         = new Date(this.selectedDate() + 'T12:00:00');
    const formatted = d.toLocaleDateString('ca-ES', { weekday: 'long', day: 'numeric', month: 'short' });
    return this.isToday() ? `Avui · ${formatted}` : formatted;
  });

  readonly sportList = SPORT_TYPES.map(type => ({ type, ...SPORT_CONFIG[type] }));

  readonly doneSports = computed(() =>
    this.sportService.getSportsForDate(this.selectedDate())
  );

  readonly recentSessions = computed(() =>
    this.sportService.sessions().filter(s => s.date !== this.selectedDate()).slice(0, 30)
  );

  /** Group recent sessions by date for the list view. */
  readonly recentGroups = computed((): { date: string; sports: SportType[] }[] => {
    const byDate = new Map<string, SportType[]>();
    for (const s of this.recentSessions()) {
      const arr = byDate.get(s.date) ?? [];
      arr.push(s.sport);
      byDate.set(s.date, arr);
    }
    return Array.from(byDate.entries())
      .map(([date, sports]) => ({ date, sports }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 20);
  });

  constructor() {
    // Ensure data is loaded for the displayed month
    effect(() => {
      const date = this.selectedDate();
      const [yearStr, monthStr] = date.split('-');
      this.sportService.ensureMonthLoaded(parseInt(yearStr), parseInt(monthStr) - 1);
    });
  }

  isSportDone(sport: SportType): boolean {
    return this.sportService.hasSportOnDate(this.selectedDate(), sport);
  }

  async toggleSport(sport: SportType): Promise<void> {
    this.toggling.set(true);
    try {
      await this.sportService.toggleSport(this.selectedDate(), sport);
    } catch {
      this.snackBar.open('Error en guardar', '', { duration: 2500 });
    } finally {
      this.toggling.set(false);
    }
  }

  navigateDate(days: number): void {
    const d = new Date(this.selectedDate() + 'T12:00:00');
    d.setDate(d.getDate() + days);
    this.selectedDate.set(d.toISOString().split('T')[0]);
  }

  openCalendar(): void {
    const ref = this.dialog.open(CalendarComponent, {
      data: { selectedDate: this.selectedDate() },
      panelClass: 'cal-dialog',
      width: '360px',
      maxWidth: '95vw',
    });
    ref.afterClosed().subscribe((date: string | undefined) => {
      if (date) this.selectedDate.set(date);
    });
  }

  getSportLabel(sport: SportType): string { return SPORT_CONFIG[sport].label; }
  getSportIcon(sport: SportType): string  { return SPORT_CONFIG[sport].icon; }
  getSportColor(sport: SportType): string { return SPORT_CONFIG[sport].color; }

  getDay(date: string): string {
    return new Date(date + 'T12:00:00').toLocaleDateString('ca-ES', { day: 'numeric' });
  }
  getMonthYear(date: string): string {
    return new Date(date + 'T12:00:00').toLocaleDateString('ca-ES', { month: 'short', year: '2-digit' });
  }
}
