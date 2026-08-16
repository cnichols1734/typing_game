import assert from "node:assert/strict";
import { test } from "node:test";
import { boomBank } from "./audio.ts";

test("capital ships use the large explosion bank", () => {
  assert.equal(boomBank("capital"), "large");
});

test("heavy hulls and failed words use the medium bank", () => {
  assert.equal(boomBank("cruiser"), "medium");
  assert.equal(boomBank("dreadnought"), "medium");
  assert.equal(boomBank("fail"), "medium");
});

test("fighters and supply drops use the small bank", () => {
  assert.equal(boomBank("fighter"), "small");
  assert.equal(boomBank("supply"), "small");
});
