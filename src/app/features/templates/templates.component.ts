import { Component, computed, inject, signal, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Location } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';

import { CATEGORY_COLORS, CATEGORY_LABELS, ExerciseCategory } from '../../core/models/exercise.model';
import { TemplateEntry, WorkoutTemplate } from '../../core/models/template.model';
import { TemplateService } from '../../core/services/template.service';
import { ExercisePickerDialogComponent } from '../train/components/exercise-picker-dialog.component';

type EditorCat = ExerciseCategory | 'mixed';

const CAT_OPTIONS: { value: EditorCat; label: string; color: string }[] = [
  { value: 'push',  label: CATEGORY_LABELS.push,  color: CATEGORY_COLORS.push  },
  { value: 'pull',  label: CATEGORY_LABELS.pull,  color: CATEGORY_COLORS.pull  },
  { value: 'legs',  label: CATEGORY_LABELS.legs,  color: CATEGORY_COLORS.legs  },
  { value: 'mixed', label: 'Mixt',                color: '#607d8b'              },
];

const CAT_COLOR: Record<EditorCat, string> = {
  push:  CATEGORY_COLORS.push,
  pull:  CATEGORY_COLORS.pull,
  legs:  CATEGORY_COLORS.legs,
  mixed: '#607d8b',
};

const CAT_LABEL: Record<EditorCat, string> = {
  push:  CATEGORY_LABELS.push,
  pull:  CATEGORY_LABELS.pull,
  legs:  CATEGORY_LABELS.legs,
  mixed: 'Mixt',
};

@Component({
  selector: 'app-templates',
  standalone: true,
  imports: [FormsModule, DragDropModule],
  template: `
    <div class="page">

      <div class="page-header">
        <button class="back-btn" (click)="back()">
          <span class="material-symbols-outlined">arrow_back_ios</span>
        </button>
        <h1 class="page-title">Plantilles</h1>
      </div>

      <!-- Empty state -->
      @if (sortedTemplates().length === 0 && !editorOpen()) {
        <div class="empty-state">
          <span class="material-symbols-outlined empty-icon">bookmark_border</span>
          <p class="empty-title">Sense plantilles</p>
          <p class="empty-sub">Crea una plantilla per començar entrenaments ràpidament.</p>
        </div>
      }

      <!-- Template list -->
      @if (sortedTemplates().length > 0) {
        <div class="section">
          <div class="list">
            @for (t of sortedTemplates(); track t.id) {
              <div class="template-card" [style.--tc]="catColor(t.category)">
                <div class="tc-accent"></div>
                <div class="tc-body">
                  <div class="tc-top">
                    <span class="tc-name">{{ t.name }}</span>
                    <span class="tc-badge" [style.background]="catColor(t.category)">{{ catLabel(t.category) }}</span>
                  </div>
                  <div class="tc-meta-row">
                    <span class="tc-sub">
                      @if (t.entries.length === 0) { Sense exercicis }
                      @else { {{ t.entries.length }} exercici{{ t.entries.length === 1 ? '' : 's' }} }
                    </span>
                    @if (t.useCount && t.useCount > 0) {
                      <span class="tc-use-count">
                        <span class="material-symbols-outlined">replay</span>
                        {{ t.useCount }}
                      </span>
                    }
                  </div>
                  @if (t.entries.length > 0) {
                    <div class="tc-exercises">
                      @for (e of t.entries.slice(0, 4); track e.exerciseId) {
                        <span class="tc-ex-pill">{{ e.exerciseName }}</span>
                      }
                      @if (t.entries.length > 4) {
                        <span class="tc-ex-pill tc-ex-more">+{{ t.entries.length - 4 }}</span>
                      }
                    </div>
                  }
                </div>
                <div class="tc-actions">
                  <button class="tc-action-btn" (click)="openEditor(t)" title="Editar">
                    <span class="material-symbols-outlined">edit</span>
                  </button>
                  <button class="tc-action-btn danger" (click)="deleteTemplate(t.id)" title="Eliminar">
                    <span class="material-symbols-outlined">delete</span>
                  </button>
                </div>
              </div>
            }
          </div>
        </div>
      }

      <!-- New template button -->
      @if (!editorOpen()) {
        <button class="add-btn" (click)="openEditor(null)">
          <span class="material-symbols-outlined">add</span>
          Nova plantilla
        </button>
      }

    </div>

    <!-- ── Editor bottom sheet ── -->
    @if (editorOpen()) {
      <div class="editor-backdrop" (click)="closeEditor()"></div>
      <div class="editor-sheet">

        <div class="editor-header">
          <span class="editor-title">{{ editingId() ? 'Editar plantilla' : 'Nova plantilla' }}</span>
          <button class="editor-close" (click)="closeEditor()">
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
            @for (opt of catOptions; track opt.value) {
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
                <span class="ex-name">{{ entry.exerciseName }}</span>
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

    .page-header {
      display: flex; align-items: center; gap: 8px;
      padding: 16px 16px 12px; position: sticky; top: 0;
      background: var(--c-bg); z-index: 10;
    }
    .back-btn {
      width: 36px; height: 36px; border-radius: 50%;
      border: none; background: transparent; cursor: pointer;
      color: var(--c-text-2); display: flex; align-items: center; justify-content: center;
      touch-action: manipulation; transition: background 0.15s;
      .material-symbols-outlined { font-size: 20px; }
      &:hover { background: var(--c-subtle); }
    }
    .page-title { font-size: 22px; font-weight: 800; color: var(--c-text); margin: 0; }

    .section { padding: 0 16px; margin-top: 8px; }

    .list { display: flex; flex-direction: column; gap: 10px; }

    /* ── Template card ── */
    .template-card {
      display: flex; align-items: stretch;
      background: var(--c-card); border-radius: 14px;
      box-shadow: 0 2px 8px var(--c-shadow); overflow: hidden;
    }
    .tc-accent { width: 5px; flex-shrink: 0; background: var(--tc); }
    .tc-body { flex: 1; padding: 12px 10px 12px 12px; min-width: 0; }
    .tc-top { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; }
    .tc-name { font-size: 15px; font-weight: 700; color: var(--c-text); flex: 1; }
    .tc-badge {
      padding: 2px 8px; border-radius: 10px;
      font-size: 11px; font-weight: 600; color: white; flex-shrink: 0;
    }
    .tc-meta-row { display: flex; align-items: center; gap: 8px; margin-top: 1px; }
    .tc-sub { font-size: 12px; color: var(--c-text-3); flex: 1; }
    .tc-use-count {
      display: flex; align-items: center; gap: 3px;
      font-size: 11px; font-weight: 600; color: var(--c-text-3);
      .material-symbols-outlined { font-size: 13px; }
    }
    .tc-exercises { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
    .tc-ex-pill {
      padding: 2px 8px; border-radius: 10px;
      background: var(--c-border-2); color: var(--c-text-2);
      font-size: 11px; font-weight: 500;
    }
    .tc-ex-more { background: var(--c-subtle); color: var(--c-text-3); }
    .tc-actions {
      display: flex; flex-direction: column; justify-content: center;
      padding: 8px 10px 8px 4px; gap: 4px;
    }
    .tc-action-btn {
      width: 34px; height: 34px; border-radius: 8px;
      border: 1px solid var(--c-border-2); background: var(--c-subtle);
      cursor: pointer; color: var(--c-text-3); display: flex; align-items: center; justify-content: center;
      touch-action: manipulation; transition: all 0.15s;
      .material-symbols-outlined { font-size: 17px; }
      &:hover { background: var(--c-hover); color: var(--c-text-2); }
      &.danger:hover { background: rgba(239,83,80,0.1); color: #ef5350; border-color: rgba(239,83,80,0.3); }
    }

    /* ── Empty state ── */
    .empty-state {
      display: flex; flex-direction: column; align-items: center;
      padding: 60px 32px 24px; text-align: center;
    }
    .empty-icon { font-size: 52px; color: var(--c-border); margin-bottom: 12px; }
    .empty-title { font-size: 17px; font-weight: 700; color: var(--c-text-2); margin: 0 0 6px; }
    .empty-sub { font-size: 14px; color: var(--c-text-3); margin: 0; line-height: 1.5; }

    /* ── Add button ── */
    .add-btn {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      width: calc(100% - 32px); margin: 16px 16px 0;
      padding: 15px; border: 2px dashed rgba(var(--c-brand-rgb), 0.4);
      border-radius: 14px; background: rgba(var(--c-brand-rgb), 0.05);
      color: var(--c-brand); font-size: 14px; font-weight: 700;
      cursor: pointer; touch-action: manipulation; transition: all 0.18s;
      .material-symbols-outlined { font-size: 20px; }
      &:hover { border-color: var(--c-brand); border-style: solid; background: rgba(var(--c-brand-rgb), 0.1); }
    }

    /* ── Editor sheet ── */
    .editor-backdrop {
      position: fixed; inset: 0; z-index: 200;
      background: rgba(0,0,0,0.4);
    }
    .editor-sheet {
      position: fixed; bottom: 0; left: 0; right: 0; z-index: 201;
      background: var(--c-card); border-radius: 20px 20px 0 0;
      padding: 20px 20px 36px;
      box-shadow: 0 -4px 24px var(--c-shadow-md);
      max-height: 85vh; overflow-y: auto;
      animation: sheet-in 0.25s cubic-bezier(0.32, 1.2, 0.64, 1) both;
    }
    @keyframes sheet-in {
      from { transform: translateY(100%); }
      to   { transform: translateY(0); }
    }

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
      font-size: 20px; color: var(--c-border); cursor: grab;
      flex-shrink: 0; user-select: none; touch-action: none;
      &:active { cursor: grabbing; }
    }
    .ex-name { flex: 1; font-size: 14px; font-weight: 500; color: var(--c-text); }
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
  private location         = inject(Location);
  private dialog           = inject(MatDialog);
  private snackBar         = inject(MatSnackBar);

  readonly sortedTemplates = computed(() =>
    [...this.templateService.templates()].sort((a, b) => (b.useCount ?? 0) - (a.useCount ?? 0))
  );

  readonly catOptions = CAT_OPTIONS;

  readonly editorOpen  = signal(false);
  readonly editingId   = signal<string | null>(null);

  editorName    = '';
  editorCat: EditorCat = 'push';
  editorEntries: TemplateEntry[] = [];

  back(): void { this.location.back(); }

  catColor(cat: EditorCat | string): string { return CAT_COLOR[cat as EditorCat] ?? '#bbb'; }
  catLabel(cat: EditorCat | string): string { return CAT_LABEL[cat as EditorCat] ?? cat; }

  openEditor(template: WorkoutTemplate | null): void {
    if (template) {
      this.editingId.set(template.id);
      this.editorName    = template.name;
      this.editorCat     = template.category;
      this.editorEntries = [...template.entries];
    } else {
      this.editingId.set(null);
      this.editorName    = '';
      this.editorCat     = 'push';
      this.editorEntries = [];
    }
    this.editorOpen.set(true);
  }

  closeEditor(): void { this.editorOpen.set(false); }

  pickExercise(): void {
    const existingIds = this.editorEntries.map(e => e.exerciseId);
    const ref = this.dialog.open(ExercisePickerDialogComponent, {
      data: { excludeIds: existingIds },
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

  saveTemplate(): void {
    if (!this.editorName.trim()) return;
    const id = this.editingId();
    if (id) {
      this.templateService.update(id, {
        name: this.editorName.trim(),
        category: this.editorCat,
        entries: this.editorEntries,
      });
      this.snackBar.open('Plantilla actualitzada', '', { duration: 2000 });
    } else {
      this.templateService.create(this.editorName.trim(), this.editorCat, this.editorEntries);
      this.snackBar.open('Plantilla creada', '', { duration: 2000 });
    }
    this.closeEditor();
  }

  deleteTemplate(id: string): void {
    this.templateService.delete(id);
    this.snackBar.open('Plantilla eliminada', '', { duration: 2000 });
  }
}
