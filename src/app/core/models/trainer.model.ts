import { WorkoutEntry } from './workout.model';
import { FitnessGoal, GoalMode } from './user-settings.model';

export type UserRole = 'user' | 'trainer';
export type ProposalType = 'specific' | 'weekly';
export type ClientStatus = 'active' | 'removed';

export const WEEKDAY_LABELS = ['Dl', 'Dm', 'Dc', 'Dj', 'Dv', 'Ds', 'Dg'] as const;
export const WEEKDAY_FULL   = ['Dilluns', 'Dimarts', 'Dimecres', 'Dijous', 'Divendres', 'Dissabte', 'Diumenge'] as const;

export interface UserProfile {
  id:          string;
  userId:      string;
  role:        UserRole;
  displayName: string | null;
  createdAt:   Date;
}

export interface ClientGoals {
  fitnessGoal:        FitnessGoal | null;
  goalMode:           GoalMode;
  weeklyActivityGoal: number | null;
  weeklyGymGoal:      number | null;
  weeklySportGoal:    number | null;
}

export interface TrainerInvite {
  code:  string;
  token: string;
}

export interface TrainerClient {
  id:            string;
  trainerId:     string;
  clientId:      string;
  status:        ClientStatus;
  createdAt:     Date;
  clientProfile?: UserProfile;
  goals?:        ClientGoals;
}

export interface TrainerProposal {
  id:           string;
  trainerId:    string;
  clientId:     string;
  proposalType: ProposalType;
  date:         string | null;    // YYYY-MM-DD (specific proposals)
  weekday:      number | null;    // 0 = Dl … 6 = Dg (weekly proposals)
  entries:      WorkoutEntry[];
  notes:        string | null;
  createdAt:    Date;
}

export interface ProposalDraft {
  proposalType: ProposalType;
  date:         string | null;
  weekday:      number | null;
  entries:      WorkoutEntry[];
  notes:        string;
}
