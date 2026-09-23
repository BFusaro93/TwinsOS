import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

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
