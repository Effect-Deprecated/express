import * as T from "@effect-ts/core/Effect"
import * as Exit from "@effect-ts/core/Effect/Exit"
import { pipe } from "@effect-ts/system/Function"

import { LiveExpress, withExpressApp } from "../src"

describe("Dummy", () => {
  it("pass", async () => {
    const host = "127.0.0.1"
    const port = 31157
    const body = { message: "ok" }

    const exit = await pipe(
      withExpressApp((app) =>
        T.effectTotal(() => {
          app.get("/", (_, res) => {
            res.send(body)
          })
        })
      ),
      T.andThen(T.fromPromise(() => fetch(`http://${host}:${port}/`))),
      T.chain((r) => T.fromPromise(() => r.json())),
      T.provideSomeLayer(LiveExpress(host, port)),
      T.runPromiseExit
    )

    expect(exit).toEqual(Exit.succeed(body))
  })
})
