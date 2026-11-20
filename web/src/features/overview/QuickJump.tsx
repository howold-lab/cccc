import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ClipboardIcon, HomeIcon } from "../../components/Icons";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../../components/ui/command";
import { Dialog, DialogContent, DialogTitle } from "../../components/ui/dialog";
import { useGroupActivityStore } from "../../stores/useGroupActivityStore";
import type { OverviewView } from "../../stores/useOverviewStore";
import { useQuickJumpStore } from "../../stores/useQuickJumpStore";
import type { GroupMeta } from "../../types";
import { oneLine } from "./plainText";

/** ⌘K / Ctrl+K: jump to a Group, the overview or the task board by typing. */
export function QuickJump({
  groups,
  enabled,
  onOpenGroup,
  onOpenOverview,
}: {
  groups: GroupMeta[];
  enabled: boolean;
  onOpenGroup: (groupId: string) => void;
  onOpenOverview: (view: OverviewView) => void;
}) {
  const { t } = useTranslation("layout");
  const open = useQuickJumpStore((state) => state.open);
  const setOpen = useQuickJumpStore((state) => state.setOpen);
  const activity = useGroupActivityStore((state) => state.byGroup);

  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        useQuickJumpStore.getState().toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);

  if (!enabled) return null;
  const choose = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="top-[18%] -translate-y-0 w-[min(calc(100vw-1rem),36rem)] p-0"
        data-quick-jump
      >
        <DialogTitle className="sr-only">{t("overview.palette.title")}</DialogTitle>
        <Command loop>
          <CommandInput autoFocus placeholder={t("overview.palette.placeholder")} />
          <CommandList className="p-1.5">
            <CommandEmpty>{t("overview.palette.empty")}</CommandEmpty>
            <CommandGroup heading={t("overview.palette.pages")}>
              <CommandItem
                value={`page overview ${t("overview.nav")}`}
                onSelect={() => choose(() => onOpenOverview("overview"))}
              >
                <HomeIcon size={16} />
                <span>{t("overview.nav")}</span>
              </CommandItem>
              <CommandItem
                value={`page tasks ${t("overview.tasksNav")}`}
                onSelect={() => choose(() => onOpenOverview("tasks"))}
              >
                <ClipboardIcon size={16} />
                <span>{t("overview.tasksNav")}</span>
              </CommandItem>
            </CommandGroup>
            <CommandGroup heading={t("overview.palette.groups")}>
              {groups.map((group) => {
                const title = group.title || group.group_id;
                const latest = activity[group.group_id]?.lastReply;
                return (
                  <CommandItem
                    key={group.group_id}
                    value={`${title} ${group.group_id}`}
                    onSelect={() => choose(() => onOpenGroup(group.group_id))}
                    data-quick-jump-group={group.group_id}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{title}</span>
                      {latest ? (
                        <span className="truncate text-xs text-[var(--color-text-tertiary)]">
                          {oneLine(latest.text)}
                        </span>
                      ) : null}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
