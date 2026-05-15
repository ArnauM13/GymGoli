import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import {
  ClientStatus, ProposalType, TrainerClient, TrainerInvite,
  TrainerProposal, UserProfile, UserRole,
} from '../models/trainer.model';
import { Workout } from '../models/workout.model';

@Injectable({ providedIn: 'root' })
export class TrainerService {
  private supabase = inject(SupabaseService).client;
  private auth     = inject(AuthService);

  private readonly _profile       = signal<UserProfile | null>(null);
  private readonly _profileLoaded = signal(false);
  private readonly _myTrainer     = signal<UserProfile | null>(null);
  private readonly _myProposals   = signal<TrainerProposal[]>([]);
  private readonly _clients       = signal<TrainerClient[]>([]);
  private readonly _clientsLoaded = signal(false);
  private readonly _activeInvite  = signal<TrainerInvite | null>(null);

  readonly profile        = this._profile.asReadonly();
  readonly profileLoaded  = this._profileLoaded.asReadonly();
  readonly isTrainer      = computed(() => this._profile()?.role === 'trainer');
  readonly myTrainer      = this._myTrainer.asReadonly();
  readonly hasTrainer     = computed(() => this._myTrainer() !== null);
  readonly myProposals    = this._myProposals.asReadonly();
  readonly clients        = this._clients.asReadonly();
  readonly clientsLoaded  = this._clientsLoaded.asReadonly();
  readonly activeInvite   = this._activeInvite.asReadonly();

  constructor() {
    effect(() => {
      const uid = this.auth.uid();
      this._profile.set(null);
      this._profileLoaded.set(false);
      this._myTrainer.set(null);
      this._myProposals.set([]);
      this._clients.set([]);
      this._clientsLoaded.set(false);
      this._activeInvite.set(null);
      if (uid) this._init(uid);
    });
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────

  private async _init(uid: string): Promise<void> {
    try {
      const { data } = await this.supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', uid)
        .maybeSingle();

      if (data) this._profile.set(this._mapProfile(data));
    } catch { /* table may not exist yet */ }

    this._profileLoaded.set(true);

    await Promise.all([
      this._loadMyTrainer(uid),
      this._loadMyProposals(uid),
    ]);
  }

  private async _loadMyTrainer(uid: string): Promise<void> {
    try {
      const { data: rel } = await this.supabase
        .from('trainer_clients')
        .select('trainer_id')
        .eq('client_id', uid)
        .eq('status', 'active')
        .maybeSingle();

      if (!rel) return;

      const { data: prof } = await this.supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', rel['trainer_id'])
        .maybeSingle();

      if (prof) this._myTrainer.set(this._mapProfile(prof));
    } catch { }
  }

  private async _loadMyProposals(uid: string): Promise<void> {
    try {
      const { data } = await this.supabase
        .from('trainer_proposals')
        .select('*')
        .eq('client_id', uid);

      this._myProposals.set((data ?? []).map(r => this._mapProposal(r)));
    } catch { }
  }

  // ── Trainer mode ──────────────────────────────────────────────────────────

  async activateTrainerMode(): Promise<void> {
    await this._setRole('trainer');
  }

  async deactivateTrainerMode(): Promise<void> {
    await this._setRole('user');
  }

  private async _setRole(role: UserRole): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) return;

    const user        = this.auth.user();
    const displayName = this._profile()?.displayName
      ?? ((user?.user_metadata?.['full_name'] as string | undefined) ?? null);

    const { data, error } = await this.supabase
      .from('user_profiles')
      .upsert({ user_id: uid, role, display_name: displayName }, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) throw error;
    this._profile.set(this._mapProfile(data));
  }

  // ── Invite management (trainer) ───────────────────────────────────────────

  async generateInvite(): Promise<TrainerInvite> {
    const { data, error } = await this.supabase.rpc('generate_trainer_invite');
    if (error) throw error;
    if (data['error']) throw new Error(data['error'] as string);
    const invite: TrainerInvite = { code: data['code'] as string, token: data['token'] as string };
    this._activeInvite.set(invite);
    return invite;
  }

  async loadActiveInvite(): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) return;
    try {
      const { data } = await this.supabase
        .from('trainer_invites')
        .select('code, token')
        .eq('trainer_id', uid)
        .is('used_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      this._activeInvite.set(data ? { code: data['code'] as string, token: data['token'] as string } : null);
    } catch { }
  }

  // ── Invite acceptance (client) ────────────────────────────────────────────

  async acceptInviteByCode(code: string): Promise<void> {
    const { data, error } = await this.supabase
      .rpc('accept_trainer_invite', { p_code: code });
    if (error) throw error;
    if (data['error']) throw new Error(data['error'] as string);
    const uid = this.auth.uid();
    if (uid) await this._loadMyTrainer(uid);
  }

  async acceptInviteByToken(token: string): Promise<void> {
    const { data, error } = await this.supabase
      .rpc('accept_trainer_invite_by_token', { p_token: token });
    if (error) throw error;
    if (data['error']) throw new Error(data['error'] as string);
    const uid = this.auth.uid();
    if (uid) {
      await this._loadMyTrainer(uid);
      await this._loadMyProposals(uid);
    }
  }

  // ── Client relationship (client side) ────────────────────────────────────

  async disconnectFromTrainer(): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) return;
    await this.supabase
      .from('trainer_clients')
      .update({ status: 'removed' as ClientStatus })
      .eq('client_id', uid)
      .eq('status', 'active');
    this._myTrainer.set(null);
    this._myProposals.set([]);
  }

  // ── Client list (trainer side) ────────────────────────────────────────────

  async loadClients(): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) return;
    this._clientsLoaded.set(false);
    try {
      const { data: rows } = await this.supabase
        .from('trainer_clients')
        .select('*')
        .eq('trainer_id', uid)
        .eq('status', 'active')
        .order('created_at', { ascending: true });

      const clientIds = (rows ?? []).map(r => r['client_id'] as string);

      let profileMap: Record<string, UserProfile> = {};
      if (clientIds.length) {
        const { data: profiles } = await this.supabase
          .from('user_profiles')
          .select('*')
          .in('user_id', clientIds);
        profileMap = Object.fromEntries(
          (profiles ?? []).map(p => [p['user_id'] as string, this._mapProfile(p)])
        );
      }

      this._clients.set((rows ?? []).map(r => ({
        id:            r['id'] as string,
        trainerId:     r['trainer_id'] as string,
        clientId:      r['client_id'] as string,
        status:        r['status'] as ClientStatus,
        createdAt:     new Date(r['created_at'] as string),
        clientProfile: profileMap[r['client_id'] as string],
      })));
    } catch { }
    this._clientsLoaded.set(true);
  }

  async removeClient(clientId: string): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) return;
    await this.supabase
      .from('trainer_clients')
      .update({ status: 'removed' as ClientStatus })
      .eq('trainer_id', uid)
      .eq('client_id', clientId);
    this._clients.update(list => list.filter(c => c.clientId !== clientId));
  }

  // ── Client workouts (trainer view) ───────────────────────────────────────

  async getClientWorkouts(clientId: string, from: string, to: string): Promise<Workout[]> {
    const { data } = await this.supabase
      .from('workouts')
      .select('*')
      .eq('user_id', clientId)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false });

    return (data ?? []).map(r => ({
      id:               r['id'] as string,
      date:             r['date'] as string,
      entries:          (r['entries'] ?? []) as Workout['entries'],
      category:         r['category'] as string | undefined,
      categories:       (r['categories'] ?? []) as string[],
      notes:            r['notes'] as string | undefined,
      sourceProposalId: r['source_proposal_id'] as string | null | undefined,
      createdAt:        new Date(r['created_at'] as string),
    }));
  }

  // ── Proposals (trainer side) ──────────────────────────────────────────────

  async getClientProposals(clientId: string): Promise<TrainerProposal[]> {
    const { data } = await this.supabase
      .from('trainer_proposals')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });
    return (data ?? []).map(r => this._mapProposal(r));
  }

  async createProposal(p: Omit<TrainerProposal, 'id' | 'trainerId' | 'createdAt'>): Promise<TrainerProposal> {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');

    const { data, error } = await this.supabase
      .from('trainer_proposals')
      .insert({
        trainer_id:    uid,
        client_id:     p.clientId,
        proposal_type: p.proposalType,
        date:          p.date,
        weekday:       p.weekday,
        entries:       p.entries,
        notes:         p.notes ?? null,
      })
      .select()
      .single();

    if (error) throw error;
    return this._mapProposal(data);
  }

  async updateProposal(
    id: string,
    patch: Partial<Pick<TrainerProposal, 'entries' | 'notes' | 'date' | 'weekday'>>,
  ): Promise<void> {
    const dbPatch: Record<string, unknown> = {};
    if (patch.entries !== undefined) dbPatch['entries'] = patch.entries;
    if (patch.notes   !== undefined) dbPatch['notes']   = patch.notes;
    if (patch.date    !== undefined) dbPatch['date']    = patch.date;
    if (patch.weekday !== undefined) dbPatch['weekday'] = patch.weekday;

    const { error } = await this.supabase
      .from('trainer_proposals')
      .update(dbPatch)
      .eq('id', id);
    if (error) throw error;
  }

  async deleteProposal(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('trainer_proposals')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  // ── Proposal helpers (client side) ───────────────────────────────────────

  getProposalForDate(date: string): TrainerProposal | null {
    const proposals = this._myProposals();
    const specific  = proposals.find(p => p.proposalType === 'specific' && p.date === date);
    if (specific) return specific;
    const wd = this._jsDateToWeekday(new Date(date + 'T00:00:00'));
    return proposals.find(p => p.proposalType === 'weekly' && p.weekday === wd) ?? null;
  }

  // ── Mapping helpers ───────────────────────────────────────────────────────

  private _jsDateToWeekday(d: Date): number {
    // JS: 0=Sun → our 0=Mon
    return (d.getDay() + 6) % 7;
  }

  private _mapProfile(r: Record<string, unknown>): UserProfile {
    return {
      id:          r['id'] as string,
      userId:      r['user_id'] as string,
      role:        r['role'] as UserRole,
      displayName: r['display_name'] as string | null,
      createdAt:   new Date(r['created_at'] as string),
    };
  }

  private _mapProposal(r: Record<string, unknown>): TrainerProposal {
    return {
      id:           r['id'] as string,
      trainerId:    r['trainer_id'] as string,
      clientId:     r['client_id'] as string,
      proposalType: r['proposal_type'] as ProposalType,
      date:         r['date'] as string | null,
      weekday:      r['weekday'] as number | null,
      entries:      (r['entries'] ?? []) as TrainerProposal['entries'],
      notes:        r['notes'] as string | null,
      createdAt:    new Date(r['created_at'] as string),
    };
  }
}
