import { expect, it } from "vite-plus/test";
import { oneLine } from "./plainText";

it("turns a Markdown message into one plain line", () => {
  expect(
    oneLine(
      "## Progress\n- **Taobao** library is live\n- see [the doc](https://x.y) and `run.sh`\n",
    ),
  ).toBe("Progress Taobao library is live see the doc and run.sh");
});

it("drops code blocks and table rules", () => {
  expect(oneLine("Data:\n| day | views |\n|---|---|\n| 11/14 | 128 |\n```\nlog\n```\ndone")).toBe(
    "Data: day views 11/14 128 done",
  );
});
