import { Injectable, signal } from '@angular/core';

import { ExerciseCategory } from '../models/exercise.model';
import { TemplateEntry, WorkoutTemplate } from '../models/template.model';

@Injectable({ providedIn: 'root' })
export class TemplateService {
  private static readonly _SK = 'gymgoli_templates';

  readonly templates = signal<WorkoutTemplate[]>(TemplateService._load());

  private static _load(): WorkoutTemplate[] {
    try {
      const raw = localStorage.getItem(TemplateService._SK);
      return raw ? (JSON.parse(raw) as WorkoutTemplate[]) : [];
    } catch { return []; }
  }

  private _save(): void {
    try { localStorage.setItem(TemplateService._SK, JSON.stringify(this.templates())); } catch {}
  }

  create(name: string, category: ExerciseCategory | 'mixed', entries: TemplateEntry[]): WorkoutTemplate {
    const t: WorkoutTemplate = {
      id: crypto.randomUUID(),
      name: name.trim(),
      category,
      entries,
      createdAt: new Date().toISOString().split('T')[0],
    };
    this.templates.update(list => [...list, t]);
    this._save();
    return t;
  }

  update(id: string, patch: Partial<Pick<WorkoutTemplate, 'name' | 'category' | 'entries'>>): void {
    this.templates.update(list => list.map(t => t.id === id ? { ...t, ...patch } : t));
    this._save();
  }

  delete(id: string): void {
    this.templates.update(list => list.filter(t => t.id !== id));
    this._save();
  }

  forCategory(category: ExerciseCategory | 'mixed'): WorkoutTemplate[] {
    return this.templates().filter(t => t.category === category || t.category === 'mixed');
  }
}
