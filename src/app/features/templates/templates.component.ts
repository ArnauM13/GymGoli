import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { A11yModule } from '@angular/cdk/a11y';

import { CATEGORY_COLORS, CATEGORY_LABELS, Exercise, ExerciseCategory } from '../../core/models/exercise.model';
import { BUILT_IN_TEMPLATES, BuiltInTemplate, TemplateEntry, WorkoutTemplate } from '../../core/models/template.model';
import { TemplateService } from '../../core/services/template.service';
import { ExerciseService } from '../../core/services/exercise.service';
import { TrainingTypeService } from '../../core/services/training-type.service';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { ExercisePickerDialogComponent } from '../train/components/exercise-picker-dialog.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { FeedbackService } from '../../shared/services/feedback.service';

type EditorCat = ExerciseCategory | 'mixed';

const MIXED_COLOR = '#607d8b';
const MIXED_LABEL = 'Mixt';

@Component({
  selector: 'app-templates',
  standalone: true,
  imports: [FormsModule, DragDropModule, A11yModule, PageHeaderComponent],
  template: `
    <div class="page">

      <app-page-header title="Plantilles" [showBack]="true" />

      <!-- ── Les meves plantilles ── -->
      <div class="section">
        <div class="section-header">
          <span class="material-symbols-outlined section-icon">bookmark</span>
          <h2 class="section-title">Les meves plantilles</h2>
        </div>

        @if (sortedTemplates().length === 0 && templateService.isLoaded()) {
          <div class="empty-state">
            <span class="material-symbols-outlined empty-icon">bookmark_border</span>
            <p class="empty-sub">Encara no tens cap plantilla pròpia.</p>
          </div>
        } @else if (sortedTemplates().length > 0) {
          <div class="list">
            @for (t of sortedTemplates(); track t.id) {
              <div class="template-card" [style.--tc]="catColor(t.category)"
                   [class.template-card--open]="isExpanded(t.id)">
                <div class="tc-accent"></div>
                <div class="tc-content">
                  <div class="tc-row">
                    <button class="tc-toggle" (click)="toggleExpanded(t.id)"
                            [attr.aria-expanded]="isExpanded(t.id)">
                      <div class="tc-info">
                        <span class="tc-name">{{ t.name }}</span>
                        <div class="tc-meta">
                          <span class="tc-badge" [style.background]="catColor(t.category)">{{ catLabel(t.category) }}</span>
                          <span class="tc-count">{{ t.entries.length }} {{ t.entries.length === 1 ? 'exercici' : 'exercicis' }}</span>
                          @if (t.useCount && t.useCount > 0) {
                            <span class="tc-uses"><span class="material-symbols-outlined">replay</span>{{ t.useCount }}</span>
                          }
                        </div>
                      </div>
                      <span class="material-symbols-outlined tc-chevron">expand_more</span>
                    </button>
                    <button class="tc-action" (click)="openEditor(t)" aria-label="Editar">
                      <span class="material-symbols-outlined">edit</span>
                    </button>
                    <button class="tc-action tc-action--danger" (click)="deleteTemplate(t.id)" aria-label="Eliminar">
                      <span class="material-symbols-outlined">delete</span>
                    </button>
                  </div>

                  @if (isExpanded(t.id)) {
                    <div class="tc-detail">
                      @if (t.entries.length > 0) {
                        <ul class="tc-ex-list">
                          @for (e of t.entries; track e.exerciseId) {
                            <li class="tc-ex-row">
                              <span class="tc-ex-name">{{ e.exerciseName }}</span>
                              @if (entryParams(e); as p) { <span class="tc-ex-params">{{ p }}</span> }
                            </li>
                          }
                        </ul>
                      } @else {
                        <span class="tc-empty-ex">Sense exercicis</span>
                      }
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        }

        @if (!editorOpen()) {
          <button class="add-btn" (click)="openEditor(null)">
            <span class="material-symbols-outlined">add</span>
            Crea una plantilla
          </button>
        }
      </div>

      <!-- ── Suggeriments ── -->
      @if (visibleBuiltIns().length > 0) {
        <div class="section">
          <div class="section-header">
            <span class="material-symbols-outlined section-icon">auto_awesome</span>
            <h2 class="section-title">Suggeriments</h2>
          </div>
          <div class="list">
            @for (t of visibleBuiltIns(); track t.id) {
              <div class="template-card" [style.--tc]="catColor(t.category)"
                   [class.template-card--open]="isExpanded(t.id)">
                <div class="tc-accent"></div>
                <div class="tc-content">
                  <div class="tc-row">
                    <button class="tc-toggle" (click)="toggleExpanded(t.id)"
                            [attr.aria-expanded]="isExpanded(t.id)">
                      <div class="tc-info">
                        <span class="tc-name">{{ t.name }}</span>
                        <div class="tc-meta">
                          <span class="tc-badge" [style.background]="catColor(t.category)">{{ catLabel(t.category) }}</span>
                          <span class="tc-count">{{ t.exerciseNames.length }} {{ t.exerciseNames.length === 1 ? 'exercici' : 'exercicis' }}</span>
                        </div>
                      </div>
                      <span class="material-symbols-outlined tc-chevron">expand_more</span>
                    </button>
                    <button class="tc-action tc-action--brand" (click)="addSuggested(t)" aria-label="Afegir">
                      <span class="material-symbols-outlined">add</span>
                    </button>
                    <button class="tc-action tc-action--danger" (click)="dismissSuggested(t.id)" aria-label="Eliminar">
                      <span class="material-symbols-outlined">delete</span>
                    </button>
                  </div>

                  @if (isExpanded(t.id)) {
                    <div class="tc-detail">
                      <ul class="tc-ex-list">
                        @for (name of t.exerciseNames; track name) {
                          <li class="tc-ex-row"><span class="tc-ex-name">{{ name }}</span></li>
                        }
                      </ul>
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        </div>
      }

    </div>

    <!-- ── Editor bottom sheet ── -->
    @if (editorOpen()) {
      <div class="editor-backdrop bottom-sheet-backdrop" (click)="closeEditor()" aria-hidden="true"></div>
      <div class="editor-sheet bottom-sheet" role="dialog" aria-modal="true"
           aria-labelledby="editor-title" cdkTrapFocus cdkTrapFocusAutoCapture>
        <span class="bottom-sheet-handle" aria-hidden="true"></span>

        <div class="editor-header">
          <span class="editor-title" id="editor-title">{{ editingId() ? 'Editar plantilla' : 'Nova plantilla' }}</span>
          <button class="editor-close" (click)="closeEditor()" aria-label="Tancar">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <!-- Name -->
        <div class="editor-field">
          <label class="editor-label">Nom</label>
          <input class="editor-input" [(ngModel)]="editorName" placeholder="Ex: Push A" maxlength="40" autocomplete="off">
        </div>

        <!-- Category -->
        <div class="editor-field">
          <label class="editor-label">Categoria</label>
          <div class="cat-chips">
            @for (opt of catOptions(); track opt.value) {
              <button class="cat-chip" [class.active]="editorCat === opt.value"
                      [style.--cc]="opt.color"
                      (click)="editorCat = opt.value">{{ opt.label }}</button>
            }
          </div>
        </div>

        <!-- Exercise list -->
        <div class="editor-field">
          <label class="editor-label">Exercicis</label>
          <div class="editor-exercises" cdkDropList (cdkDropListDropped)="dropExercise($event)">
            @for (entry of editorEntries; track entry.exerciseId; let i = $index) {
              <div class="editor-ex-row" cdkDrag>
                <span class="material-symbols-outlined ex-drag" cdkDragHandle>drag_indicator</span>
                <div class="ex-body">
                  <span class="ex-name">{{ entry.exerciseName }}</span>
                  <div class="ex-params">
                    <label class="ex-param-lbl">Sèr</label>
                    <input class="ex-param-input" type="number" min="1" max="99"
                           [(ngModel)]="entry.sets" placeholder="—">
                    <span class="ex-param-sep">×</span>
                    <label class="ex-param-lbl">Rep</label>
                    <input class="ex-param-input" type="number" min="1" max="99"
                           [(ngModel)]="entry.reps" placeholder="—">
                    <span class="ex-param-gap"></span>
                    <input class="ex-param-input ex-param-weight" type="number" min="0" step="0.5"
                           [(ngModel)]="entry.weight" placeholder="—">
                    <label class="ex-param-lbl">kg</label>
                  </div>
                </div>
                <button class="ex-remove" (click)="removeExercise(i)">
                  <span class="material-symbols-outlined">close</span>
                </button>
              </div>
            }
            @if (editorEntries.length === 0) {
              <p class="ex-empty">Afegeix exercicis a la plantilla</p>
            }
          </div>
          <button class="ex-add-btn" (click)="pickExercise()">
            <span class="material-symbols-outlined">add</span>
            Afegir exercici
          </button>
        </div>

        <!-- Actions -->
        <div class="editor-actions">
          <button class="editor-cancel" (click)="closeEditor()">Cancel·lar</button>
          <button class="editor-save" (click)="saveTemplate()" [disabled]="!editorName.trim()">
            Desar plantilla
          </button>
        </div>

      </div>
    }
  `,
  styles: [`
    .page { min-height: 100vh; background: var(--c-bg); padding-bottom: 32px; }

    .section { padding: 0 16px; margin-top: 16px; }
    .section-header { display: flex; align-items: center; gap: 7px; margin-bottom: 10px; }
    .section-icon  { font-size: 17px; color: var(--c-text-3); font-variation-settings: 'FILL' 0, 'wght' 300; }
    .section-title { margin: 0; font-size: 14px; font-weight: 700; color: var(--c-text-2); letter-spacing: 0.2px; }

    .list { display: flex; flex-direction: column; gap: 10px; }

    /* ── Template card (compact, collapsible — mirrors the exercises list) ── */
    .template-card {
      display: flex; align-items: stretch;
      background: var(--c-card); border: 1.5px solid var(--c-border-2); border-radius: 14px;
      overflow: hidden; transition: box-shadow 0.15s, border-color 0.15s;
      &:hover { box-shadow: 0 2px 8px var(--c-shadow); border-color: var(--c-border); }
    }
    .tc-accent { width: 5px; align-self: stretch; flex-shrink: 0; background: var(--tc); }
    .tc-content { flex: 1; min-width: 0; display: flex; flex-direction: column; }

    .tc-row { display: flex; align-items: center; }
    .tc-toggle {
      flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px;
      padding: 10px; border: none; background: transparent; text-align: left;
      cursor: pointer; touch-action: manipulation;
    }
    .tc-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
    .tc-name {
      font-size: 14px; font-weight: 700; color: var(--c-text);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .tc-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .tc-badge {
      padding: 1px 7px; border-radius: 8px; flex-shrink: 0;
      font-size: 10px; font-weight: 600; color: white;
    }
    .tc-count { font-size: 11px; font-weight: 600; color: var(--c-text-3); }
    .tc-uses {
      display: flex; align-items: center; gap: 3px;
      font-size: 11px; font-weight: 600; color: var(--c-text-3);
      .material-symbols-outlined { font-size: 13px; }
    }
    .tc-chevron {
      font-size: 20px; color: var(--c-text-3); flex-shrink: 0;
      transition: transform 0.2s;
    }
    .template-card--open .tc-chevron { transform: rotate(180deg); }

    .tc-action {
      width: 36px; height: 36px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      border: none; background: transparent; cursor: pointer;
      color: var(--c-text-3); touch-action: manipulation; transition: color 0.15s, background 0.15s;
      .material-symbols-outlined { font-size: 18px; }
      &:hover { color: var(--c-text-2); background: var(--c-hover); }
      &.tc-action--danger:hover { color: #ef5350; background: rgba(239,83,80,0.08); }
      &.tc-action--brand { color: var(--c-brand); }
      &.tc-action--brand:hover { color: var(--c-brand-dk); background: rgba(var(--c-brand-rgb), 0.08); }
      &:last-child { margin-right: 4px; }
    }

    /* ── Expanded detail: vertical exercise list ── */
    .tc-detail { margin: 0 12px 8px; padding-top: 8px; border-top: 1px solid var(--c-border-2); }
    .tc-ex-list { list-style: none; margin: 0; padding: 0; }
    .tc-ex-row {
      display: flex; align-items: center; gap: 10px;
      padding: 6px 0;
      border-bottom: 1px solid var(--c-border-2);
      &:last-child { border-bottom: none; }
    }
    .tc-ex-name {
      flex: 1; min-width: 0;
      font-size: 13px; font-weight: 500; color: var(--c-text-2);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .tc-ex-params {
      flex-shrink: 0; font-size: 12px; font-weight: 700; color: var(--c-text-3);
      font-variant-numeric: tabular-nums;
    }
    .tc-empty-ex { font-size: 12.5px; color: var(--c-text-3); font-style: italic; }

    /* ── Empty state (nested under "Les meves plantilles") ── */
    .empty-state {
      display: flex; flex-direction: column; align-items: center;
      padding: 20px 16px 6px; text-align: center;
    }
    .empty-icon { font-size: 42px; color: var(--c-border); margin-bottom: 10px; }
    .empty-sub { font-size: 13.5px; color: var(--c-text-3); margin: 0; line-height: 1.5; }

    /* ── Add button ── */
    .add-btn {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      width: 100%; margin: 14px 0 0; box-sizing: border-box;
      padding: 15px; border: 2px dashed rgba(var(--c-brand-rgb), 0.4);
      border-radius: 14px; background: rgba(var(--c-brand-rgb), 0.05);
      color: var(--c-brand); font-size: 14px; font-weight: 700;
      cursor: pointer; touch-action: manipulation; transition: all 0.18s;
      .material-symbols-outlined { font-size: 20px; }
      &:hover { border-color: var(--c-brand); border-style: solid; background: rgba(var(--c-brand-rgb), 0.1); }
    }

    /* ── Editor sheet (floating bottom sheet — see global .bottom-sheet) ── */
    .editor-sheet { padding: 8px 20px 22px; }

    .editor-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 20px;
    }
    .editor-title { font-size: 18px; font-weight: 800; color: var(--c-text); }
    .editor-close {
      width: 32px; height: 32px; border-radius: 50%;
      border: none; background: var(--c-subtle); cursor: pointer;
      color: var(--c-text-3); display: flex; align-items: center; justify-content: center;
      touch-action: manipulation; transition: background 0.15s;
      .material-symbols-outlined { font-size: 18px; }
      &:hover { background: var(--c-hover); color: var(--c-text-2); }
    }

    .editor-field { margin-bottom: 18px; }
    .editor-label {
      display: block; font-size: 12px; font-weight: 700; color: var(--c-text-2);
      text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 8px;
    }
    .editor-input {
      width: 100%; padding: 12px 14px; border-radius: 10px;
      border: 1.5px solid var(--c-border); background: var(--c-subtle);
      font-size: 16px; color: var(--c-text); outline: none;
      box-sizing: border-box; transition: border-color 0.15s;
      &:focus { border-color: var(--c-brand); background: var(--c-card); }
    }

    /* ── Category chips ── */
    .cat-chips { display: flex; gap: 6px; flex-wrap: wrap; }
    .cat-chip {
      padding: 7px 14px; border-radius: 16px;
      border: 1.5px solid var(--c-border-2); background: var(--c-subtle);
      font-size: 13px; font-weight: 600; color: var(--c-text-2);
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      &.active {
        background: var(--cc); border-color: var(--cc); color: white;
      }
      &:hover:not(.active) { border-color: var(--cc, var(--c-brand)); color: var(--cc, var(--c-brand)); }
    }

    /* ── Exercise list in editor ── */
    .editor-exercises {
      display: flex; flex-direction: column; gap: 2px;
      margin-bottom: 8px;
    }
    .editor-ex-row {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 8px; border-radius: 8px;
      background: var(--c-subtle); border: 1px solid var(--c-border-2);
      margin-bottom: 4px;
    }
    .ex-drag {
      font-size: 20px; color: var(--c-text-3); cursor: grab;
      flex-shrink: 0; user-select: none; touch-action: none;
      &:active { cursor: grabbing; }
    }
    .ex-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
    .ex-name { font-size: 14px; font-weight: 600; color: var(--c-text); }
    .ex-params { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
    .ex-param-lbl { font-size: 11px; font-weight: 600; color: var(--c-text-3); }
    .ex-param-input {
      width: 40px; padding: 3px 5px; border-radius: 6px;
      border: 1.5px solid var(--c-border); background: var(--c-card);
      font-size: 13px; font-weight: 600; color: var(--c-text); text-align: center;
      appearance: textfield;
      &::-webkit-inner-spin-button, &::-webkit-outer-spin-button { appearance: none; }
      &:focus { border-color: var(--c-brand); outline: none; background: var(--c-card); }
    }
    .ex-param-weight { width: 50px; }
    .ex-param-sep { font-size: 13px; font-weight: 700; color: var(--c-text-3); }
    .ex-param-gap { flex: 1; min-width: 6px; }
    .ex-remove {
      width: 28px; height: 28px; border-radius: 6px;
      border: none; background: transparent; cursor: pointer;
      color: var(--c-text-3); display: flex; align-items: center; justify-content: center;
      touch-action: manipulation; transition: all 0.12s;
      .material-symbols-outlined { font-size: 16px; }
      &:hover { background: rgba(239,83,80,0.1); color: #ef5350; }
    }
    .ex-empty {
      padding: 14px; text-align: center; color: var(--c-text-3);
      font-size: 13px; font-style: italic; margin: 0;
    }
    .ex-add-btn {
      display: flex; align-items: center; gap: 6px;
      width: 100%; padding: 11px 14px; border-radius: 10px;
      border: 1.5px dashed rgba(var(--c-brand-rgb), 0.4);
      background: rgba(var(--c-brand-rgb), 0.04); color: var(--c-brand);
      font-size: 13px; font-weight: 600;
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      .material-symbols-outlined { font-size: 18px; }
      &:hover { border-style: solid; background: rgba(var(--c-brand-rgb), 0.1); }
    }

    /* ── Editor action buttons ── */
    .editor-actions { display: flex; gap: 8px; margin-top: 4px; }
    .editor-cancel {
      flex: 1; padding: 13px; border-radius: 12px;
      border: 1.5px solid var(--c-border); background: transparent;
      color: var(--c-text-2); font-size: 15px; font-weight: 600;
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      &:hover { background: var(--c-subtle); }
    }
    .editor-save {
      flex: 2; padding: 13px; border-radius: 12px;
      border: none; background: var(--c-brand);
      color: white; font-size: 15px; font-weight: 700;
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      &:hover:not(:disabled) { background: var(--c-brand-dk); }
      &:disabled { opacity: 0.4; cursor: default; }
    }
  `],
})
export class TemplatesComponent {
  readonly templateService = inject(TemplateService);
  private exerciseService  = inject(ExerciseService);
  private typeService      = inject(TrainingTypeService);
  private settingsService  = inject(UserSettingsService);
  private dialog           = inject(MatDialog);
  private feedback         = inject(FeedbackService);

  readonly sortedTemplates = computed(() =>
    [...this.templateService.templates()].sort((a, b) => (b.useCount ?? 0) - (a.useCount ?? 0))
  );

  readonly visibleBuiltIns = computed(() => {
    const dismissed = new Set(this.settingsService.dismissedBuiltInTemplateIds());
    // Hide suggestions for a built-in type the user has removed.
    const have = new Set(this.typeService.types().map(t => t.id));
    return BUILT_IN_TEMPLATES.filter(t => !dismissed.has(t.id) && have.has(t.category));
  });

  readonly catOptions = computed((): { value: EditorCat; label: string; color: string }[] => [
    ...this.typeService.types().map(t => ({ value: t.id as EditorCat, label: t.name, color: t.color })),
    { value: 'mixed', label: MIXED_LABEL, color: MIXED_COLOR },
  ]);

  readonly editorOpen  = signal(false);
  readonly editingId   = signal<string | null>(null);

  /** Ids of the template cards currently expanded. Empty by default so every
   *  card opens collapsed — the page stays compact, like the exercises list. */
  readonly expandedIds = signal<Set<string>>(new Set());

  isExpanded(id: string): boolean { return this.expandedIds().has(id); }
  toggleExpanded(id: string): void {
    const next = new Set(this.expandedIds());
    if (next.has(id)) next.delete(id); else next.add(id);
    this.expandedIds.set(next);
  }

  editorName    = '';
  editorCat: EditorCat = 'mixed';
  editorEntries: TemplateEntry[] = [];

  constructor() {
    this.exerciseService.ensureLoaded();
  }

  catColor(cat: EditorCat | string): string {
    return cat === 'mixed' ? MIXED_COLOR : (cat in CATEGORY_COLORS ? CATEGORY_COLORS[cat] : '#bbb');
  }
  catLabel(cat: EditorCat | string): string {
    return cat === 'mixed' ? MIXED_LABEL : (CATEGORY_LABELS[cat] ?? cat);
  }

  /** Compact "sets×reps · weight" suffix for an exercise row (empty when
   *  the template didn't specify any). */
  entryParams(e: TemplateEntry): string {
    const parts: string[] = [];
    if (e.sets && e.reps) parts.push(`${e.sets}×${e.reps}`);
    if (e.weight) parts.push(`${e.weight}kg`);
    return parts.join(' · ');
  }

  openEditor(template: WorkoutTemplate | null): void {
    if (template) {
      this.editingId.set(template.id);
      this.editorName    = template.name;
      this.editorCat     = template.category;
      this.editorEntries = [...template.entries];
    } else {
      this.editingId.set(null);
      this.editorName    = '';
      this.editorCat     = this.typeService.types()[0]?.id ?? 'mixed';
      this.editorEntries = [];
    }
    this.editorOpen.set(true);
  }

  closeEditor(): void { this.editorOpen.set(false); }

  /** Close the editor sheet with Escape, for keyboard and accessibility.
   *  Skips while a Material dialog (e.g. the exercise picker) is open so its
   *  own Escape handling takes precedence. */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.dialog.openDialogs.length) return;
    if (this.editorOpen()) this.closeEditor();
  }

  pickExercise(): void {
    const existingIds  = this.editorEntries.map(e => e.exerciseId);
    const defaultCategory = this.editorCat !== 'mixed' ? this.editorCat as ExerciseCategory : undefined;
    const ref = this.dialog.open(ExercisePickerDialogComponent, {
      data: { excludeIds: existingIds, defaultCategory },
      width: '400px', maxHeight: '85vh',
    });
    ref.afterClosed().subscribe(ex => {
      if (ex) this.editorEntries = [...this.editorEntries, { exerciseId: ex.id, exerciseName: ex.name }];
    });
  }

  removeExercise(index: number): void {
    this.editorEntries = this.editorEntries.filter((_, i) => i !== index);
  }

  dropExercise(event: CdkDragDrop<TemplateEntry[]>): void {
    const entries = [...this.editorEntries];
    moveItemInArray(entries, event.previousIndex, event.currentIndex);
    this.editorEntries = entries;
  }

  async saveTemplate(): Promise<void> {
    if (!this.editorName.trim()) return;
    const id = this.editingId();
    try {
      if (id) {
        await this.templateService.update(id, {
          name: this.editorName.trim(),
          category: this.editorCat,
          entries: this.editorEntries,
        });
        this.feedback.success('Plantilla actualitzada', 2000);
      } else {
        await this.templateService.create(this.editorName.trim(), this.editorCat, this.editorEntries);
        this.feedback.success('Plantilla creada', 2000);
      }
      this.closeEditor();
    } catch {
      this.feedback.error('Error en desar la plantilla', 3000);
    }
  }

  async deleteTemplate(id: string): Promise<void> {
    try {
      await this.templateService.delete(id);
      this.feedback.success('Plantilla eliminada', 2000);
    } catch {
      this.feedback.error('Error en eliminar', 3000);
    }
  }

  /** Copies a suggested built-in into the user's own templates, matching
   *  exercises by name (any without a match in the user's library are
   *  dropped, same best-effort resolution used when starting a workout
   *  straight from a suggestion). */
  async addSuggested(t: BuiltInTemplate): Promise<void> {
    try {
      const exercises = this.exerciseService.exercises();
      const entries: TemplateEntry[] = t.exerciseNames
        .map(name => exercises.find(e => e.name === name))
        .filter((e): e is Exercise => e !== undefined)
        .map(e => ({ exerciseId: e.id, exerciseName: e.name }));
      await this.templateService.create(t.name, t.category, entries);
      this.feedback.success('Plantilla afegida', 2000);
    } catch {
      this.feedback.error('Error en afegir la plantilla', 3000);
    }
  }

  async dismissSuggested(id: string): Promise<void> {
    const next = [...this.settingsService.dismissedBuiltInTemplateIds(), id];
    await this.settingsService.update({ dismissedBuiltInTemplateIds: next });
  }
}
