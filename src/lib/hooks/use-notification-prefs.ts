import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface NotificationPrefs {
  // Email — personal events
  emailWorkOrderAssigned: boolean;
  emailWorkOrderStatusChanged: boolean;
  emailWorkOrderOverdue: boolean;
  emailWorkOrderComment: boolean;
  emailRequisitionApproved: boolean;
  emailRequisitionRejected: boolean;
  emailApprovalRequired: boolean;
  emailPoApprovalRequired: boolean;
  emailLowStockAlert: boolean;
  emailPmScheduleDue: boolean;
  emailNewMaintenanceRequest: boolean;
  // Email — admin: any WO events (shown only to admins in Settings)
  emailAdminWoCreated: boolean;
  emailAdminWoStatusChanged: boolean;
  emailAdminWoComment: boolean;
  // In-app — personal events
  inAppWorkOrderAssigned: boolean;
  inAppWorkOrderStatusChanged: boolean;
  inAppWorkOrderOverdue: boolean;
  inAppWorkOrderComment: boolean;
  inAppRequisitionApproved: boolean;
  inAppRequisitionRejected: boolean;
  inAppApprovalRequired: boolean;
  inAppPoApprovalRequired: boolean;
  inAppLowStockAlert: boolean;
  inAppPmScheduleDue: boolean;
  inAppNewMaintenanceRequest: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  emailWorkOrderAssigned: true,
  emailWorkOrderStatusChanged: true,
  emailWorkOrderOverdue: true,
  emailWorkOrderComment: true,
  emailRequisitionApproved: true,
  emailRequisitionRejected: true,
  emailApprovalRequired: true,
  emailPoApprovalRequired: true,
  emailLowStockAlert: true,
  emailPmScheduleDue: false,
  emailNewMaintenanceRequest: false,
  emailAdminWoCreated: false,
  emailAdminWoStatusChanged: false,
  emailAdminWoComment: false,
  inAppWorkOrderAssigned: true,
  inAppWorkOrderStatusChanged: true,
  inAppWorkOrderOverdue: true,
  inAppWorkOrderComment: true,
  inAppRequisitionApproved: true,
  inAppRequisitionRejected: true,
  inAppApprovalRequired: true,
  inAppPoApprovalRequired: true,
  inAppLowStockAlert: true,
  inAppPmScheduleDue: false,
  inAppNewMaintenanceRequest: false,
};

function mergePrefs(stored: Record<string, unknown>): NotificationPrefs {
  return { ...DEFAULT_NOTIFICATION_PREFS, ...stored } as NotificationPrefs;
}

export function useNotificationPrefs() {
  return useQuery<NotificationPrefs>({
    queryKey: ["notification-prefs"],
    queryFn: async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("profiles")
        .select("notification_prefs")
        .eq("id", user.id)
        .single();
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return mergePrefs((data as any).notification_prefs ?? {});
    },
  });
}

export function useUpdateNotificationPrefs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (prefs: Partial<NotificationPrefs>) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Merge with existing prefs to do a partial update
      const existing = queryClient.getQueryData<NotificationPrefs>(["notification-prefs"])
        ?? DEFAULT_NOTIFICATION_PREFS;
      const merged = { ...existing, ...prefs };

      const { error } = await supabase
        .from("profiles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ notification_prefs: merged } as any)
        .eq("id", user.id);
      if (error) throw error;
      return merged;
    },
    onSuccess: (merged) => {
      queryClient.setQueryData(["notification-prefs"], merged);
    },
    onError: (err) => console.error("[useUpdateNotificationPrefs]", err),
  });
}
