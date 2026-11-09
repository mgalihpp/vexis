import { expect, test } from "bun:test";
import { swipeTarget } from "./tab-swipe";

test.each([
  ["left swipe goes to the next tab", 1, -100, 10, 200, 2],
  ["right swipe goes to the previous tab", 1, 100, 10, 200, 0],
  ["no tab before the first", 0, 100, 0, 200, null],
  ["no tab after the last", 4, -100, 0, 200, null],
  ["too short", 1, -40, 0, 200, null],
  ["too vertical, a scroll", 1, -100, 60, 200, null],
  ["too slow, a drag", 1, -100, 0, 900, null],
  ["no active tab", -1, -100, 0, 200, null],
])("%s", (_, index, dx, dy, ms, expected) => {
  expect(swipeTarget(index, 5, dx, dy, ms)).toBe(expected);
});
