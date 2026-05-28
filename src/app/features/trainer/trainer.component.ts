import {
  Component, OnInit, inject, signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ConfirmDialogService } from '../../shared/services/confirm-dialog.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { TrainerService } from '../../core/services/trainer.service';
import {
  ClientGoals, TrainerClient, TrainerProposal, WEEKDAY_FULL, WEEKDAY_LABELS,
} from '../../core/models/trainer.model';
import {
  FITNESS_GOAL_EMOJIS, FITNESS_GOAL_LABELS,
} from '../../core/models/user-settings.model';
import { Workout, FEELING_EMOJI } from '../../core/models/workout.model';

type DashboardView = 'clients' | 'detail';

@Component({
  selector: 'app-trainer',
  standalone: true,
  imports: [DatePipe, PageHeaderComponent],
  template: `
    <div class="page">

      <app-page-header title="Entrenador">
        @if (trainerService.clients().length > 0) {
          <button class="header-add" (click)="showInvitePanel()" aria-label="Convidar client">
            <span class="material-symbols-outlined">person_add</span>
          </button>
        }
      </app-page-header>

      <!-- ── Invite panel ──────────────────────────────────────────────── -->
      @if (invitePanelOpen()) {
        <div class="card-section invite-panel">
          <div class="section-header">
            <span class="material-symbols-outlined section-icon">link</span>
            <h2 class="section-title">Convidar client</h2>
            <button class="icon-btn" (click)="invitePanelOpen.set(false)" aria-label="Tancar">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>

          @if (trainerService.activeInvite(); as inv) {
            <p class="invite-desc">Comparteix el codi o l'enllaç. Caduca als 7 dies.</p>
            <div class="invite-code-row">
              <span class="invite-code">{{ inv.code }}</span>
              <button class="btn-secondary" (click)="copyCode(inv.code)">
                <span class="material-symbols-outlined">content_copy</span>
                Copia codi
              </button>
            </div>
            <div class="invite-link-row">
              <button class="btn-secondary invite-link-btn" (click)="copyLink(inv.token)">
                <span class="material-symbols-outlined">share</span>
                Copia enllaç
              </button>
              <button class="btn-secondary invite-link-btn" (click)="generateInvite()">
                <span class="material-symbols-outlined">refresh</span>
                Nou
              </button>
            </div>
          } @else {
            <p class="invite-desc">Genera un codi d'invitació per afegir clients.</p>
            <button class="btn-primary" (click)="generateInvite()" [disabled]="generatingInvite()">
              @if (generatingInvite()) {
                <span class="material-symbols-outlined spin">sync</span>
              } @else {
                <span class="material-symbols-outlined">add</span>
              }
              Genera invitació
            </button>
          }
        </div>
      }

      <!-- ── No clients yet ────────────────────────────────────────────── -->
      @if (!trainerService.clientsLoaded()) {
        <div class="card-section">
          <div class="sk sk-line" style="height:44px; margin-bottom:8px"></div>
          <div class="sk sk-line" style="height:44px; margin-bottom:8px"></div>
          <div class="sk sk-line" style="height:44px"></div>
        </div>
      } @else if (trainerService.clients().length === 0) {
        <div class="card-section">
          <div class="empty-state">
            <span class="material-symbols-outlined empty-icon">group</span>
            <p>Encara no tens clients</p>
            <div class="empty-actions">
              <button class="btn-primary" (click)="showInvitePanel()">
                <span class="material-symbols-outlined">person_add</span>
                Afegir primer client
              </button>
            </div>
          </div>
        </div>

      <!-- ── Client list + detail ──────────────────────────────────────── -->
      } @else {

        <!-- Client selector chips -->
        <div class="client-chips">
          @for (c of trainerService.clients(); track c.id) {
            <button
              class="client-chip"
              [class.active]="selectedClient()?.id === c.id"
              (click)="selectClient(c)"
            >
              <span class="material-symbols-outlined chip-icon">person</span>
              {{ clientName(c) }}
            </button>
          }
        </div>

        @if (selectedClient(); as client) {

          <!-- ── Client goals ───────────────────────────────────── -->
          @if (clientGoals(); as goals) {
            <div class="card-section goals-section">
              <div class="section-header">
                <span class="material-symbols-outlined section-icon">target</span>
                <h2 class="section-title">Objectiu del client</h2>
              </div>

              <div class="goals-body">
                @if (goals.fitnessGoal) {
                  <div class="goal-pill">
                    <span class="goal-emoji">{{ goalEmoji(goals.fitnessGoal) }}</span>
                    <span class="goal-label">{{ goalLabel(goals.fitnessGoal) }}</span>
                  </div>
                } @else {
                  <p class="goal-none">Sense objectiu definit</p>
                }

                @if (goals.goalMode === 'combined' && goals.weeklyActivityGoal !== null) {
                  <div class="goal-target">
                    <span class="material-symbols-outlined goal-target-icon">repeat</span>
                    <span>{{ goals.weeklyActivityGoal }} activitats / setmana</span>
                  </div>
                }
                @if (goals.goalMode === 'separate') {
                  @if (goals.weeklyGymGoal !== null) {
                    <div class="goal-target">
                      <span class="material-symbols-outlined goal-target-icon">fitness_center</span>
                      <span>{{ goals.weeklyGymGoal }} gym / setmana</span>
                    </div>
                  }
                  @if (goals.weeklySportGoal !== null) {
                    <div class="goal-target">
                      <span class="material-symbols-outlined goal-target-icon">directions_run</span>
                      <span>{{ goals.weeklySportGoal }} esport / setmana</span>
                    </div>
                  }
                }
              </div>
            </div>
          } @else if (clientWorkoutsLoaded()) {
            <div class="card-section goals-section goals-section--empty">
              <div class="section-header">
                <span class="material-symbols-outlined section-icon">target</span>
                <h2 class="section-title">Objectiu del client</h2>
              </div>
              <p class="goal-none">El client no ha definit cap objectiu.</p>
            </div>
          }

          <!-- ── Weekly routine ────────────────────────────────────── -->
          <div class="card-section">
            <div class="section-header">
              <span class="material-symbols-outlined section-icon">calendar_view_week</span>
              <h2 class="section-title">Rutina setmanal</h2>
            </div>

            <div class="week-grid">
              @for (day of weekdays; track day.index) {
                <div class="week-cell" [class.has-proposal]="weeklyProposal(day.index, client.clientId)">
                  <span class="week-label">{{ day.short }}</span>
                  @if (weeklyProposal(day.index, client.clientId); as prop) {
                    <div class="week-proposal">
                      <span class="week-proposal-text">
                        {{ prop.entries.length }} ex.
                      </span>
                      <button class="week-remove" (click)="deleteWeeklyProposal(prop)" aria-label="Eliminar">
                        <span class="material-symbols-outlined">close</span>
                      </button>
                    </div>
                  } @else {
                    <button class="week-add" (click)="openProposalForm('weekly', day.index, client.clientId)" aria-label="Afegir">
                      <span class="material-symbols-outlined">add</span>
                    </button>
                  }
                </div>
              }
            </div>
          </div>

          <!-- ── Specific proposals ────────────────────────────────── -->
          <div class="card-section">
            <div class="section-header">
              <span class="material-symbols-outlined section-icon">event</span>
              <h2 class="section-title">Propostes puntuals</h2>
              <button class="icon-btn section-add" (click)="openProposalForm('specific', null, client.clientId)" aria-label="Nova proposta">
                <span class="material-symbols-outlined">add</span>
              </button>
            </div>

            @for (prop of specificProposals(client.clientId); track prop.id) {
              <div class="item-card">
                <div class="ic-bar" style="background: #006874"></div>
                <div class="ic-info">
                  <span class="ic-name">{{ prop.date | date:'d MMM' }}</span>
                  <span class="ic-detail">{{ prop.entries.length }} exercici{{ prop.entries.length !== 1 ? 's' : '' }}{{ prop.notes ? ' · ' + prop.notes : '' }}</span>
                </div>
                <button class="ic-action ic-action--danger" (click)="deleteProposal(prop)" aria-label="Eliminar">
                  <span class="material-symbols-outlined">delete</span>
                </button>
              </div>
            } @empty {
              <p class="empty-hint">Sense propostes puntuals.</p>
            }
          </div>

          <!-- ── Proposal form ─────────────────────────────────────── -->
          @if (proposalForm(); as form) {
            <div class="card-section proposal-form">
              <div class="section-header">
                <span class="material-symbols-outlined section-icon">edit_note</span>
                <h2 class="section-title">
                  {{ form.type === 'specific' ? 'Nova proposta puntual' : 'Rutina ' + weekdayFull(form.weekday!) }}
                </h2>
                <button class="icon-btn" (click)="proposalForm.set(null)" aria-label="Cancel·lar">
                  <span class="material-symbols-outlined">close</span>
                </button>
              </div>

              @if (form.type === 'specific') {
                <div class="form-row">
                  <label class="form-label">Data</label>
                  <input
                    class="form-input"
                    type="date"
                    [value]="form.date ?? ''"
                    (change)="setFormDate($event)"
                  />
                </div>
              }

              <!-- Exercises -->
              <div class="form-row">
                <label class="form-label">Exercicis</label>
              </div>

              @for (entry of form.entries; track $index; let i = $index) {
                <div class="entry-row">
                  <input
                    class="form-input entry-name"
                    type="text"
                    placeholder="Nom de l'exercici"
                    [value]="entry.exerciseName"
                    (input)="updateEntryName(i, $event)"
                  />
                  <button class="ic-action ic-action--danger" (click)="removeEntry(i)" aria-label="Eliminar exercici">
                    <span class="material-symbols-outlined">close</span>
                  </button>
                </div>
              }

              <button class="btn-secondary btn-add-exercise" (click)="addEntry()">
                <span class="material-symbols-outlined">add</span>
                Afegir exercici
              </button>

              <!-- Notes -->
              <div class="form-row" style="margin-top: 12px">
                <label class="form-label">Notes (opcional)</label>
                <textarea
                  class="form-input form-textarea"
                  placeholder="Indicacions per al client..."
                  [value]="form.notes"
                  (input)="setFormNotes($event)"
                ></textarea>
              </div>

              <button
                class="btn-primary btn-save"
                [disabled]="savingProposal() || form.entries.length === 0"
                (click)="saveProposal(client.clientId)"
              >
                @if (savingProposal()) {
                  <span class="material-symbols-outlined spin">sync</span>
                } @else {
                  <span class="material-symbols-outlined">check</span>
                }
                Desar proposta
              </button>
            </div>
          }

          <!-- ── Compliance grid (4 weeks) ────────────────────────── -->
          @if (complianceDays().length > 0) {
            <div class="card-section">
              <div class="section-header">
                <span class="material-symbols-outlined section-icon">task_alt</span>
                <h2 class="section-title">Compliment (4 setmanes)</h2>
              </div>
              <div class="compliance-legend">
                <span class="legend-dot legend-dot--followed"></span><span class="legend-label">Proposta seguida</span>
                <span class="legend-dot legend-dot--own"></span><span class="legend-label">Propi</span>
                <span class="legend-dot legend-dot--missed"></span><span class="legend-label">Perdut</span>
                <span class="legend-dot legend-dot--free"></span><span class="legend-label">Lliure</span>
              </div>
              <div class="compliance-grid">
                @for (day of complianceDays(); track day.date) {
                  <div
                    class="compliance-dot"
                    [class.compliance-dot--followed]="day.state === 'followed'"
                    [class.compliance-dot--own]="day.state === 'own'"
                    [class.compliance-dot--missed]="day.state === 'missed'"
                    [class.compliance-dot--free]="day.state === 'free'"
                    [title]="day.date + ': ' + complianceLabel(day.state)"
                  ></div>
                }
              </div>
            </div>
          }

          <!-- ── Client workout history ─────────────────────────────── -->
          <div class="card-section">
            <div class="section-header">
              <span class="material-symbols-outlined section-icon">history</span>
              <h2 class="section-title">Historial recent</h2>
            </div>

            @if (!clientWorkoutsLoaded()) {
              <div class="sk sk-line" style="height:52px; margin-bottom:6px"></div>
              <div class="sk sk-line" style="height:52px; margin-bottom:6px"></div>
              <div class="sk sk-line" style="height:52px"></div>
            } @else if (clientWorkouts().length === 0) {
              <p class="empty-hint">{{ clientName(client) }} encara no ha registrat cap entrenament.</p>
            } @else {
              @for (w of clientWorkouts(); track w.id) {
                <div class="workout-card" [class.from-proposal]="!!w.sourceProposalId">
                  <div class="workout-date">{{ formatDate(w.date) }}</div>
                  <div class="workout-body">
                    <div class="workout-categories">
                      @for (cat of (w.categories?.length ? w.categories : [w.category ?? '']); track cat) {
                        <span class="cat-chip cat-chip--{{ cat }}">{{ catLabel(cat) }}</span>
                      }
                    </div>
                    @for (entry of w.entries; track entry.exerciseId) {
                      <div class="workout-entry">
                        <span class="entry-name-text">{{ entry.exerciseName }}</span>
                        <span class="entry-sets">{{ entry.sets.length }} sèr.</span>
                        @if (entry.feeling) {
                          <span class="entry-feeling">{{ feelingEmoji(entry.feeling) }}</span>
                        }
                      </div>
                    }
                    @if (w.notes) {
                      <p class="workout-notes">{{ w.notes }}</p>
                    }
                    @if (w.sourceProposalId) {
                      <span class="proposal-badge">
                        <span class="material-symbols-outlined">check_circle</span>
                        Proposta seguida
                      </span>
                    }
                  </div>
                </div>
              }
            }
          </div>

          <!-- Remove client -->
          <div class="card-section section--danger">
            <button class="danger-row" (click)="confirmRemoveClient(client)">
              <span class="material-symbols-outlined">person_remove</span>
              Eliminar {{ clientName(client) }} de la llista
            </button>
          </div>
        }
      }

    </div>
  `,
  styles: [`
    .page { padding: 0 0 84px; }

    .header-add {
      width: 36px; height: 36px; border-radius: 50%; border: none;
      background: var(--c-brand); color: white; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s, transform 0.1s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 20px; }
      &:hover  { background: var(--c-brand-dk); }
      &:active { transform: scale(0.94); }
    }

    .card-section {
      margin: 12px 16px 0;
      padding: 14px 14px 16px;
      background: var(--c-card); border-radius: 18px;
      box-shadow: 0 2px 10px var(--c-shadow);
      animation: ic-in 0.25s cubic-bezier(0.34,1.4,0.64,1) both;
    }
    @keyframes ic-in {
      from { opacity: 0; transform: translateY(-6px) scale(0.98); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }

    .section-header { display: flex; align-items: center; gap: 7px; margin-bottom: 12px; }
    .section-icon   { font-size: 18px; color: var(--c-text-3); font-variation-settings: 'FILL' 0, 'wght' 300; }
    .section-title  { margin: 0; flex: 1; font-size: 14px; font-weight: 700; color: var(--c-text-2); letter-spacing: 0.2px; }
    .icon-btn {
      width: 32px; height: 32px; border-radius: 50%; border: none;
      background: transparent; cursor: pointer; color: var(--c-text-3);
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 18px; }
      &:hover { background: var(--c-hover); color: var(--c-text-2); }
    }
    .section-add { margin-left: 2px; }

    /* ── Invite panel ── */
    .invite-panel { border: 2px solid rgba(var(--c-brand-rgb), 0.22); }
    .invite-desc  { margin: 0 0 12px; font-size: 13px; color: var(--c-text-2); line-height: 1.4; }
    .invite-code-row {
      display: flex; align-items: center; gap: 10px; margin-bottom: 8px;
    }
    .invite-code {
      font-size: 26px; font-weight: 800; letter-spacing: 4px; color: var(--c-brand);
      font-family: monospace;
    }
    .invite-link-row { display: flex; gap: 8px; }
    .invite-link-btn { flex: 1; justify-content: center; }

    /* ── Buttons ── */
    .btn-primary {
      display: flex; align-items: center; gap: 6px; justify-content: center;
      padding: 9px 16px; border: none; border-radius: 10px;
      background: var(--c-brand); color: white;
      font-size: 13px; font-weight: 700; cursor: pointer;
      transition: background 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 16px; }
      &:hover:not(:disabled) { background: var(--c-brand-dk); }
      &:disabled { opacity: 0.5; cursor: default; }
    }
    .btn-secondary {
      display: flex; align-items: center; gap: 6px;
      padding: 8px 14px; border-radius: 10px;
      border: 1.5px solid var(--c-border); background: var(--c-card); color: var(--c-text-2);
      font-size: 13px; font-weight: 600; cursor: pointer;
      transition: all 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 15px; }
      &:hover { border-color: var(--c-text-3); color: var(--c-text); }
    }

    /* ── Client chips ── */
    .client-chips {
      display: flex; gap: 6px;
      padding: 8px 16px 0;
      overflow-x: auto; scrollbar-width: none;
      &::-webkit-scrollbar { display: none; }
    }
    .client-chip {
      display: flex; align-items: center; gap: 5px;
      padding: 7px 14px; border-radius: 20px;
      border: 1.5px solid var(--c-border); background: var(--c-card);
      font-size: 13px; font-weight: 600; color: var(--c-text-2);
      cursor: pointer; white-space: nowrap; touch-action: manipulation;
      transition: all 0.15s;
      .chip-icon { font-size: 15px; }
      &:hover:not(.active) { border-color: var(--c-brand); color: var(--c-brand); }
      &.active { background: var(--c-brand); border-color: var(--c-brand); color: white; }
    }

    /* ── Client goals ── */
    .goals-section--empty { opacity: 0.7; }
    .goals-body { display: flex; flex-direction: column; gap: 8px; }
    .goal-pill {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 8px 14px; border-radius: 12px;
      background: rgba(var(--c-brand-rgb), 0.1); border: 1.5px solid rgba(var(--c-brand-rgb), 0.22);
      align-self: flex-start;
    }
    .goal-emoji { font-size: 20px; line-height: 1; }
    .goal-label { font-size: 14px; font-weight: 700; color: var(--c-brand); }
    .goal-target {
      display: flex; align-items: center; gap: 7px;
      font-size: 13px; font-weight: 600; color: var(--c-text-2);
    }
    .goal-target-icon {
      font-size: 16px; color: var(--c-brand);
      font-variation-settings: 'FILL' 0, 'wght' 300;
    }
    .goal-none { margin: 0; font-size: 13px; color: var(--c-text-3); font-style: italic; }

    /* ── Week grid ── */
    .week-grid {
      display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px;
    }
    .week-cell {
      display: flex; flex-direction: column; align-items: center; gap: 4px;
      padding: 8px 4px; border-radius: 10px; border: 1.5px solid var(--c-border-2);
      background: var(--c-subtle); min-height: 68px; justify-content: center;
      transition: all 0.15s;
      &.has-proposal { border-color: rgba(var(--c-brand-rgb), 0.3); background: rgba(var(--c-brand-rgb), 0.06); }
    }
    .week-label { font-size: 11px; font-weight: 700; color: var(--c-text-3); letter-spacing: 0.2px; }
    .week-proposal { display: flex; flex-direction: column; align-items: center; gap: 2px; }
    .week-proposal-text { font-size: 10px; font-weight: 600; color: var(--c-brand); }
    .week-remove {
      width: 20px; height: 20px; border-radius: 50%; border: none;
      background: transparent; cursor: pointer; color: var(--c-border);
      display: flex; align-items: center; justify-content: center;
      touch-action: manipulation;
      .material-symbols-outlined { font-size: 13px; }
      &:hover { color: #ef5350; }
    }
    .week-add {
      width: 24px; height: 24px; border-radius: 50%; border: 1.5px dashed var(--c-border);
      background: transparent; cursor: pointer; color: var(--c-text-3);
      display: flex; align-items: center; justify-content: center;
      touch-action: manipulation; transition: all 0.15s;
      .material-symbols-outlined { font-size: 15px; }
      &:hover { border-color: var(--c-brand); color: var(--c-brand); }
    }

    /* ── Item cards ── */
    .item-card {
      display: flex; align-items: center;
      margin-bottom: 6px;
      border: 1.5px solid var(--c-border-2); border-radius: 14px;
      background: var(--c-card); overflow: hidden;
      transition: box-shadow 0.15s, border-color 0.15s;
      &:hover { box-shadow: 0 2px 8px var(--c-shadow); border-color: var(--c-border); }
    }
    .ic-bar  { width: 5px; align-self: stretch; flex-shrink: 0; }
    .ic-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; padding: 10px 10px; }
    .ic-name   { font-size: 13px; font-weight: 700; color: var(--c-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ic-detail { font-size: 11px; color: var(--c-text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; &:empty { display: none; } }
    .ic-action {
      width: 36px; height: 36px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      border: none; background: transparent; cursor: pointer;
      color: var(--c-text-3); touch-action: manipulation;
      transition: color 0.15s, background 0.15s;
      .material-symbols-outlined { font-size: 17px; }
      &:hover { color: var(--c-text-2); background: var(--c-hover); }
      &.ic-action--danger:hover { color: #ef5350; background: rgba(239,83,80,0.1); }
      &:last-child { margin-right: 4px; }
    }

    .empty-hint { margin: 8px 0 0; font-size: 13px; color: var(--c-text-3); text-align: center; padding: 12px 0 4px; }

    /* ── Proposal form ── */
    .proposal-form { border: 2px solid rgba(var(--c-brand-rgb), 0.22); }
    .form-row { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
    .form-label { font-size: 12px; font-weight: 700; color: var(--c-text-3); letter-spacing: 0.3px; text-transform: uppercase; }
    .form-input {
      padding: 9px 12px; border: 1.5px solid var(--c-border); border-radius: 10px;
      font-size: 14px; color: var(--c-text); background: var(--c-subtle); outline: none;
      transition: border-color 0.15s;
      &:focus { border-color: var(--c-brand); }
    }
    .form-textarea { min-height: 72px; resize: vertical; font-family: inherit; }

    .entry-row {
      display: flex; align-items: center; gap: 6px; margin-bottom: 6px;
    }
    .entry-name { flex: 1; }
    .btn-add-exercise {
      width: 100%; justify-content: center; margin-top: 4px;
    }
    .btn-save {
      width: 100%; margin-top: 14px; justify-content: center;
    }

    /* ── Client workout history ── */
    .workout-card {
      margin-bottom: 10px; padding: 10px 12px;
      border: 1.5px solid var(--c-border-2); border-radius: 14px;
      transition: border-color 0.15s;
      &.from-proposal { border-color: rgba(var(--c-brand-rgb), 0.3); }
      &:last-child { margin-bottom: 0; }
    }
    .workout-date { font-size: 12px; font-weight: 700; color: var(--c-text-3); margin-bottom: 6px; }
    .workout-body { display: flex; flex-direction: column; gap: 4px; }
    .workout-categories { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 2px; }
    .cat-chip {
      font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 10px;
      &--push  { background: rgba(229,115,115,0.15); color: #c62828; }
      &--pull  { background: rgba(100,181,246,0.15); color: #1565c0; }
      &--legs  { background: rgba(129,199,132,0.15); color: #2e7d32; }
      &--mixed { background: rgba(var(--c-brand-rgb), 0.12); color: var(--c-brand); }
    }
    .workout-entry {
      display: flex; align-items: center; gap: 6px;
      font-size: 12px; color: var(--c-text-2);
    }
    .entry-name-text { flex: 1; font-weight: 600; color: var(--c-text); }
    .entry-sets      { color: var(--c-text-3); font-size: 11px; }
    .entry-feeling   { font-size: 13px; }
    .workout-notes {
      margin: 4px 0 0; font-size: 12px; color: var(--c-text-3); line-height: 1.4;
      font-style: italic;
    }
    .proposal-badge {
      display: inline-flex; align-items: center; gap: 4px;
      margin-top: 4px; font-size: 11px; font-weight: 600; color: var(--c-brand);
      .material-symbols-outlined {
        font-size: 13px;
        font-variation-settings: 'FILL' 1;
      }
    }

    /* ── Compliance grid ── */
    .compliance-legend {
      display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
      margin-bottom: 10px; font-size: 11px; color: var(--c-text-3);
    }
    .legend-dot {
      width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
      &--followed { background: var(--c-brand); }
      &--own      { background: #f59e0b; }
      &--missed   { background: #ef5350; }
      &--free     { background: var(--c-border); }
    }
    .legend-label { margin-right: 6px; }
    .compliance-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 4px;
    }
    .compliance-dot {
      aspect-ratio: 1; border-radius: 50%;
      background: var(--c-border-2);
      transition: transform 0.1s;
      &:hover { transform: scale(1.2); }
      &--followed { background: var(--c-brand); }
      &--own      { background: #f59e0b; }
      &--missed   { background: rgba(239,83,80,0.7); }
      &--free     { background: #c8e6c9; }
    }

    /* ── Danger section ── */
    .section--danger { padding: 0; }
    .danger-row {
      display: flex; align-items: center; gap: 8px;
      width: 100%; padding: 14px 16px; border: none;
      background: transparent; cursor: pointer;
      font-size: 14px; font-weight: 600; color: #c62828;
      border-radius: 18px; touch-action: manipulation;
      transition: background 0.15s;
      .material-symbols-outlined { font-size: 18px; }
      &:hover { background: rgba(239,83,80,0.08); }
    }

    /* ── Empty state ── */
    .empty-state {
      display: flex; flex-direction: column; align-items: center; gap: 12px;
      padding: 28px 16px; text-align: center; color: var(--c-text-3);
    }
    .empty-icon {
      font-size: 48px; color: var(--c-border);
      font-variation-settings: 'FILL' 0, 'wght' 200;
    }
    .empty-state p { margin: 0; font-size: 14px; font-weight: 500; }
    .empty-actions  { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }

    /* ── Skeleton ── */
    .sk-line {
      border-radius: 8px;
      background: linear-gradient(90deg, var(--c-border-2) 0%, var(--c-border) 40%, var(--c-border-2) 80%);
      background-size: 600px 100%;
      animation: sk-shimmer 1.5s ease-in-out infinite;
    }
    @keyframes sk-shimmer {
      from { background-position: -300px 0; }
      to   { background-position: calc(300px + 100%) 0; }
    }

    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .spin { animation: spin 1s linear infinite; }
  `],
})
export class TrainerComponent implements OnInit {
  readonly trainerService = inject(TrainerService);
  private snackBar        = inject(MatSnackBar);
  private confirmDialog   = inject(ConfirmDialogService);

  readonly invitePanelOpen  = signal(false);
  readonly generatingInvite = signal(false);
  readonly selectedClient   = signal<TrainerClient | null>(null);
  readonly clientWorkouts   = signal<Workout[]>([]);
  readonly clientWorkoutsLoaded = signal(false);
  readonly savingProposal   = signal(false);

  readonly weekdays = WEEKDAY_LABELS.map((short, index) => ({ short, index }));

  readonly proposalForm = signal<{
    type:    'specific' | 'weekly';
    weekday: number | null;
    date:    string | null;
    entries: { exerciseName: string; exerciseId: string }[];
    notes:   string;
    clientId: string;
  } | null>(null);

  // Cached per-client proposals loaded on demand
  private clientProposalsCache = new Map<string, TrainerProposal[]>();
  readonly clientProposals = signal<TrainerProposal[]>([]);

  // Compliance: date → 'followed' | 'own' | 'missed' | 'free'
  readonly complianceDays  = signal<{ date: string; state: 'followed' | 'own' | 'missed' | 'free' | 'future' }[]>([]);
  readonly clientGoals     = signal<ClientGoals | null>(null);

  ngOnInit(): void {
    this.trainerService.loadClients().then(() => {
      const first = this.trainerService.clients()[0];
      if (first) this.selectClient(first);
    });
    this.trainerService.loadActiveInvite();
  }

  selectClient(c: TrainerClient): void {
    this.selectedClient.set(c);
    this.proposalForm.set(null);
    this.loadClientData(c);
  }

  private async loadClientData(c: TrainerClient): Promise<void> {
    this.clientWorkoutsLoaded.set(false);
    this.clientGoals.set(null);
    const to   = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - 28);

    const [workouts, proposals, goals] = await Promise.all([
      this.trainerService.getClientWorkouts(
        c.clientId,
        from.toISOString().split('T')[0],
        to.toISOString().split('T')[0],
      ),
      this.trainerService.getClientProposals(c.clientId),
      this.trainerService.getClientGoals(c.clientId),
    ]);

    this.clientWorkouts.set(workouts);
    this.clientProposalsCache.set(c.clientId, proposals);
    this.clientProposals.set(proposals);
    this.complianceDays.set(this._computeCompliance(workouts, proposals));
    this.clientGoals.set(goals);
    this.clientWorkoutsLoaded.set(true);
  }

  private _computeCompliance(
    workouts: Workout[],
    proposals: TrainerProposal[],
  ): { date: string; state: 'followed' | 'own' | 'missed' | 'free' | 'future' }[] {
    const result: { date: string; state: 'followed' | 'own' | 'missed' | 'free' | 'future' }[] = [];
    const today  = new Date().toISOString().split('T')[0];
    const endD   = new Date(today + 'T00:00:00');
    const startD = new Date(endD);
    startD.setDate(startD.getDate() - 27); // 4 weeks

    for (const d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const weekday = (d.getDay() + 6) % 7;
      const isFuture = dateStr > today;

      const proposal = proposals.find(p =>
        (p.proposalType === 'specific' && p.date === dateStr) ||
        (p.proposalType === 'weekly'   && p.weekday === weekday)
      );
      const workout = workouts.find(w => w.date === dateStr);

      let state: 'followed' | 'own' | 'missed' | 'free' | 'future';
      if (isFuture) {
        state = 'future';
      } else if (proposal) {
        if (workout?.sourceProposalId === proposal.id) state = 'followed';
        else if (workout)                               state = 'own';
        else                                            state = 'missed';
      } else {
        state = workout ? 'free' : 'future'; // 'future' = empty day, reuse for "nothing"
      }
      result.push({ date: dateStr, state });
    }
    return result;
  }

  weeklyProposal(weekday: number, clientId: string): TrainerProposal | undefined {
    return (this.clientProposalsCache.get(clientId) ?? [])
      .find(p => p.proposalType === 'weekly' && p.weekday === weekday);
  }

  specificProposals(clientId: string): TrainerProposal[] {
    return (this.clientProposalsCache.get(clientId) ?? [])
      .filter(p => p.proposalType === 'specific')
      .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  }

  clientName(c: TrainerClient): string {
    return c.clientProfile?.displayName ?? `Client ${c.clientId.slice(0, 6)}`;
  }

  weekdayFull(i: number): string {
    return WEEKDAY_FULL[i] ?? '';
  }

  formatDate(date: string): string {
    return new Date(date + 'T00:00:00').toLocaleDateString('ca-ES', {
      weekday: 'short', day: 'numeric', month: 'short',
    });
  }

  catLabel(cat: string): string {
    const MAP: Record<string, string> = { push: 'Empenta', pull: 'Tracció', legs: 'Cames', mixed: 'Mixte' };
    return MAP[cat] ?? cat;
  }

  feelingEmoji(f: number): string {
    return FEELING_EMOJI[f as keyof typeof FEELING_EMOJI] ?? '';
  }

  // ── Invite ─────────────────────────────────────────────────────────────────

  showInvitePanel(): void {
    this.invitePanelOpen.set(true);
    this.trainerService.loadActiveInvite();
  }

  async generateInvite(): Promise<void> {
    this.generatingInvite.set(true);
    try {
      await this.trainerService.generateInvite();
    } catch (e) {
      this.snackBar.open((e as Error).message, 'OK', { duration: 4000 });
    } finally {
      this.generatingInvite.set(false);
    }
  }

  copyCode(code: string): void {
    navigator.clipboard.writeText(code).then(() => {
      this.snackBar.open('Codi copiat', '', { duration: 1800 });
    });
  }

  copyLink(token: string): void {
    const url = `${window.location.origin}/join/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      this.snackBar.open('Enllaç copiat', '', { duration: 1800 });
    });
  }

  // ── Proposals ─────────────────────────────────────────────────────────────

  openProposalForm(type: 'specific' | 'weekly', weekday: number | null, clientId: string): void {
    const today = new Date().toISOString().split('T')[0];
    this.proposalForm.set({
      type,
      weekday,
      date:     type === 'specific' ? today : null,
      entries:  [],
      notes:    '',
      clientId,
    });
    setTimeout(() => {
      document.querySelector('.proposal-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  setFormDate(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.proposalForm.update(f => f ? { ...f, date: value } : f);
  }

  setFormNotes(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.proposalForm.update(f => f ? { ...f, notes: value } : f);
  }

  addEntry(): void {
    this.proposalForm.update(f =>
      f ? { ...f, entries: [...f.entries, { exerciseName: '', exerciseId: '' }] } : f
    );
  }

  removeEntry(index: number): void {
    this.proposalForm.update(f =>
      f ? { ...f, entries: f.entries.filter((_, i) => i !== index) } : f
    );
  }

  updateEntryName(index: number, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.proposalForm.update(f => {
      if (!f) return f;
      const entries = [...f.entries];
      entries[index] = { ...entries[index], exerciseName: value };
      return { ...f, entries };
    });
  }

  async saveProposal(clientId: string): Promise<void> {
    const form = this.proposalForm();
    if (!form || form.entries.length === 0) return;

    this.savingProposal.set(true);
    try {
      const proposal = await this.trainerService.createProposal({
        clientId,
        proposalType: form.type,
        date:         form.type === 'specific' ? form.date : null,
        weekday:      form.type === 'weekly'   ? form.weekday : null,
        entries:      form.entries.map(e => ({ exerciseId: '', exerciseName: e.exerciseName, sets: [] })),
        notes:        form.notes || null,
      });

      const updated = [...(this.clientProposalsCache.get(clientId) ?? []), proposal];
      this.clientProposalsCache.set(clientId, updated);
      this.clientProposals.set(updated);
      this.proposalForm.set(null);
      this.snackBar.open('Proposta desada', '', { duration: 1800 });
    } catch (e) {
      this.snackBar.open((e as Error).message, 'OK', { duration: 4000 });
    } finally {
      this.savingProposal.set(false);
    }
  }

  async deleteProposal(p: TrainerProposal): Promise<void> {
    if (!await this.confirmDialog.confirm('Eliminar aquesta proposta?', { variant: 'danger', confirmLabel: 'Eliminar' })) return;
    try {
      await this.trainerService.deleteProposal(p.id);
      const updated = (this.clientProposalsCache.get(p.clientId) ?? []).filter(x => x.id !== p.id);
      this.clientProposalsCache.set(p.clientId, updated);
      this.clientProposals.set(updated);
    } catch (e) {
      this.snackBar.open((e as Error).message, 'OK', { duration: 4000 });
    }
  }

  async deleteWeeklyProposal(p: TrainerProposal): Promise<void> {
    await this.deleteProposal(p);
  }

  goalEmoji(goal: string): string {
    return FITNESS_GOAL_EMOJIS[goal as keyof typeof FITNESS_GOAL_EMOJIS] ?? '';
  }

  goalLabel(goal: string): string {
    return FITNESS_GOAL_LABELS[goal as keyof typeof FITNESS_GOAL_LABELS] ?? goal;
  }

  complianceLabel(state: string): string {
    const MAP: Record<string, string> = {
      followed: 'Proposta seguida', own: 'Entrenament propi',
      missed: 'Perdut', free: 'Lliure', future: '',
    };
    return MAP[state] ?? '';
  }

  async confirmRemoveClient(c: TrainerClient): Promise<void> {
    if (!await this.confirmDialog.confirm(`Eliminar ${this.clientName(c)} de la teva llista de clients? Les propostes creades s'eliminaran.`, { variant: 'danger', confirmLabel: 'Eliminar' })) return;
    try {
      await this.trainerService.removeClient(c.clientId);
      this.selectedClient.set(null);
      this.snackBar.open('Client eliminat', '', { duration: 2000 });
    } catch (e) {
      this.snackBar.open((e as Error).message, 'OK', { duration: 4000 });
    }
  }
}
