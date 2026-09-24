import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_SOCIAL_GOALS, type PlatformSetting, type SocialGoals } from "@/lib/utils/social-media-metrics";

/** One platform's numbers for one week (Twins Social Media dashboard). */
export interface SocialWeekStat {
  id: string;
  weekStart: string; // "YYYY-MM-DD", a Monday
  platform: string;
  posts: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  followers: number | null;
  netNewFollowers: number | null;
  leads: number | null;
  notes: string | null;
}

export type SocialWeekStatInput = Omit<SocialWeekStat, "id"> & { id?: string };

const QK = ["social-media-weekly-stats"];
const COLUMNS =
  "id, week_start, platform, posts, views, likes, comments, shares, saves, followers, net_new_followers, leads, notes";

interface Row {
  id: string;
  week_start: string;
  platform: string;
  posts: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  followers: number | null;
  net_new_followers: number | null;
  leads: number | null;
  notes: string | null;
}

function mapRow(r: Row): SocialWeekStat {
  return {
    id: r.id,
    weekStart: r.week_start,
    platform: r.platform,
    posts: r.posts,
    views: r.views,
    likes: r.likes,
    comments: r.comments,
    shares: r.shares,
    saves: r.saves,
    followers: r.followers,
    netNewFollowers: r.net_new_followers,
    leads: r.leads,
    notes: r.notes,
  };
}

function toRow(s: SocialWeekStatInput) {
  return {
    week_start: s.weekStart,
    platform: s.platform,
    posts: s.posts,
    views: s.views,
    likes: s.likes,
    comments: s.comments,
    shares: s.shares,
    saves: s.saves,
    followers: s.followers,
    net_new_followers: s.netNewFollowers,
    leads: s.leads,
    notes: s.notes,
  };
}

export function useSocialMediaStats() {
  return useQuery({
    queryKey: QK,
    queryFn: async () => {
      const supabase = createClient();
      // social_media_weekly_stats isn't in the generated types yet.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("social_media_weekly_stats")
        .select(COLUMNS)
        .is("deleted_at", null)
        .order("week_start", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as Row[]).map(mapRow);
    },
  });
}

/** Saves every platform row for a week in one go — updates rows that already
 *  exist (by id), inserts the rest. The live-row unique index is partial
 *  (deleted_at is null), which PostgREST's onConflict can't target, hence no
 *  upsert. */
export function useSaveSocialWeek() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rows: SocialWeekStatInput[]) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const table = () => (supabase as any).from("social_media_weekly_stats");
      const updates = rows.filter((r) => r.id);
      const inserts = rows.filter((r) => !r.id);
      for (const r of updates) {
        const { error } = await table().update(toRow(r)).eq("id", r.id);
        if (error) throw error;
      }
      if (inserts.length > 0) {
        const { error } = await table().insert(inserts.map(toRow));
        if (error) throw error;
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: QK }),
  });
}

/** Soft-deletes every platform row logged for a week. */
export function useDeleteSocialWeek() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("social_media_weekly_stats")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
    },
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: QK });
      const prev = queryClient.getQueryData<SocialWeekStat[]>(QK);
      queryClient.setQueryData<SocialWeekStat[]>(QK, (old) => (old ?? []).filter((r) => !ids.includes(r.id)));
      return { prev };
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(QK, ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: QK }),
  });
}

// ── Goals ─────────────────────────────────────────────────────────────────────

const GOALS_QK = ["social-media-goals"];

interface GoalsRow {
  id: string;
  posts_per_week_min: number | string;
  posts_per_week_max: number | string;
  engagement_rate_min: number | string;
  engagement_rate_max: number | string;
  leads_min: number | string;
  leads_max: number | string;
  follower_growth_min: number | string;
  follower_growth_max: number | string;
  platforms: unknown;
}

/** The org's social_media_goals row: goals plus its platform list. */
export interface SocialGoalsRecord {
  /** null when the org hasn't saved settings yet (defaults in use). */
  id: string | null;
  goals: SocialGoals;
  /** null = the default platform list. */
  platforms: PlatformSetting[] | null;
}

function parsePlatforms(raw: unknown): PlatformSetting[] | null {
  if (!Array.isArray(raw)) return null;
  return raw
    .filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null && typeof (p as { name?: unknown }).name === "string")
    .map((p) => ({
      name: String(p.name),
      color: typeof p.color === "string" ? p.color : "",
      hidden: p.hidden === true,
    }));
}

/** The org's goals, or the defaults if none have been saved. */
export function useSocialMediaGoals() {
  return useQuery({
    queryKey: GOALS_QK,
    queryFn: async (): Promise<SocialGoalsRecord> => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("social_media_goals")
        .select("id, posts_per_week_min, posts_per_week_max, engagement_rate_min, engagement_rate_max, leads_min, leads_max, follower_growth_min, follower_growth_max, platforms")
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      const r = data as GoalsRow | null;
      if (!r) return { id: null, goals: DEFAULT_SOCIAL_GOALS, platforms: null };
      // numeric columns come back as strings from PostgREST.
      return {
        id: r.id,
        goals: {
          postsPerWeekMin: Number(r.posts_per_week_min),
          postsPerWeekMax: Number(r.posts_per_week_max),
          engagementRateMin: Number(r.engagement_rate_min),
          engagementRateMax: Number(r.engagement_rate_max),
          leadsMin: Number(r.leads_min),
          leadsMax: Number(r.leads_max),
          followerGrowthMin: Number(r.follower_growth_min),
          followerGrowthMax: Number(r.follower_growth_max),
        },
        platforms: parsePlatforms(r.platforms),
      };
    },
  });
}

export function useSaveSocialMediaGoals() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, goals }: { id: string | null; goals: SocialGoals }) => {
      const supabase = createClient();
      const row = {
        posts_per_week_min: goals.postsPerWeekMin,
        posts_per_week_max: goals.postsPerWeekMax,
        engagement_rate_min: goals.engagementRateMin,
        engagement_rate_max: goals.engagementRateMax,
        leads_min: goals.leadsMin,
        leads_max: goals.leadsMax,
        follower_growth_min: goals.followerGrowthMin,
        follower_growth_max: goals.followerGrowthMax,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const table = (supabase as any).from("social_media_goals");
      const { error } = id ? await table.update(row).eq("id", id) : await table.insert(row);
      if (error) throw error;
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: GOALS_QK });
      const prev = queryClient.getQueryData<SocialGoalsRecord>(GOALS_QK);
      queryClient.setQueryData<SocialGoalsRecord>(GOALS_QK, { platforms: null, ...prev, id: next.id, goals: next.goals });
      return { prev };
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(GOALS_QK, ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: GOALS_QK }),
  });
}

/** Saves the org's platform list (order, colors, hidden flags). Creates the
 *  settings row with default goals if the org has none yet. */
export function useSaveSocialMediaPlatforms() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, platforms }: { id: string | null; platforms: PlatformSetting[] }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const table = (supabase as any).from("social_media_goals");
      const { error } = id ? await table.update({ platforms }).eq("id", id) : await table.insert({ platforms });
      if (error) throw error;
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: GOALS_QK });
      const prev = queryClient.getQueryData<SocialGoalsRecord>(GOALS_QK);
      queryClient.setQueryData<SocialGoalsRecord>(GOALS_QK, {
        id: next.id,
        goals: prev?.goals ?? DEFAULT_SOCIAL_GOALS,
        platforms: next.platforms,
      });
      return { prev };
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(GOALS_QK, ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: GOALS_QK }),
  });
}
