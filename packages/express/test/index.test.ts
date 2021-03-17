import * as T from "@effect-ts/core/Effect"
import * as Exit from "@effect-ts/core/Effect/Exit"
import * as L from "@effect-ts/core/Effect/Layer"
import { pipe } from "@effect-ts/core/Function"
import type { Has } from "@effect-ts/core/Has"
import { tag } from "@effect-ts/core/Has"

import { LiveExpress, withExpressApp } from "../src"

describe("Dummy", () => {
  it("pass", async () => {
    interface AppConfig {
      _tag: "@demo/AppConfig"
      body: { message: string }
    }

    const AppConfig = tag<AppConfig>()

    const { body: accessBodyM } = T.deriveAccessM(AppConfig)(["body"])

    const LiveAppConfig = L.fromEffect(AppConfig)(
      T.effectTotal(() => ({ _tag: "@demo/AppConfig", body: { message: "ok" } }))
    )

    const host = "127.0.0.1"
    const port = 31157

    const exit = await pipe(
      withExpressApp((app) =>
        T.runtime<Has<AppConfig>>()["|>"](
          T.chain((runtime) =>
            T.effectTotal(() => {
              app.get("/", (_, res) => {
                runtime.run(
                  accessBodyM((body) =>
                    T.effectTotal(() => {
                      res.send(body)
                    })
                  )
                )
              })
            })
          )
        )
      ),
      T.andThen(T.fromPromise(() => fetch(`http://${host}:${port}/`))),
      T.chain((r) => T.fromPromise(() => r.json())),
      T.provideSomeLayer(LiveExpress(host, port)["+++"](LiveAppConfig)),
      T.runPromiseExit
    )

    expect(exit).toEqual(Exit.succeed({ message: "ok" }))
  })
})
