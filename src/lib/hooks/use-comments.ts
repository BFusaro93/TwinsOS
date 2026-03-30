import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapComment } from "@/lib/supabase/mappers";
import type { CommentRecordType } from "@/types";

export function useComments(recordType: CommentRecordType, recordId: string) {
  return useQuery({
    queryKey: ["comments", recordType, recordId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("comments")
        .select("*")
        .eq("record_type", recordType)
        .eq("record_id", recordId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data.map(mapComment);
    },
    enabled: !!recordId,
  });
}

export function useAddComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      recordType: CommentRecordType;
      recordId: string;
      authorName: string;
      body: string;
    }) => {
      const supabase = createClient();

      // Get current user for org_id and author_id
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .single();
      if (!profile) throw new Error("Profile not found");

      const { data, error } = await supabase
        .from("comments")
        .insert({
          org_id: profile.org_id,
          created_by: user.id,
          author_id: user.id,
          record_type: input.recordType,
          record_id: input.recordId,
          author_name: input.authorName,
          body: input.body,
        })
        .select()
        .single();
      if (error) throw error;
      return mapComment(data);
    },
    onSuccess: (_, { recordType, recordId }) => {
      queryClient.invalidateQueries({ queryKey: ["comments", recordType, recordId] });
    },
  });
}
