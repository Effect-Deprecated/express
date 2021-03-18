import * as T from "@effect-ts/core/Effect"
import * as Exit from "@effect-ts/core/Effect/Exit"
import * as L from "@effect-ts/core/Effect/Layer"
import { pipe } from "@effect-ts/core/Function"
import { tag } from "@effect-ts/core/Has"

import * as Express from "../src"

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
      Express.get("/", (_, _res) =>
        accessBodyM((_body) =>
          T.effectTotal(() => {
            _res.send(_body)
          })
        )
      ),
      T.andThen(T.fromPromise(() => fetch(`http://${host}:${port}/`))),
      T.chain((r) => T.fromPromise(() => r.json())),
      T.provideSomeLayer(Express.LiveExpress(host, port)["+++"](LiveAppConfig)),
      T.runPromiseExit
    )

    expect(exit).toEqual(Exit.succeed({ message: "ok" }))
  })
  it("pass", async () => {
    const fakeLog = jest.fn()
    const consoleSpy = jest.spyOn(console, "error")

    consoleSpy.mockImplementation(fakeLog)

    const host = "127.0.0.1"
    const port = 31157

    await pipe(
      Express.get("/", (_, _res) =>
        T.effectTotal(() => {
          throw new Error("defect")
        })
      ),
      T.andThen(T.fromPromise(() => fetch(`http://${host}:${port}/`))),
      T.provideSomeLayer(Express.LiveExpress(host, port)),
      T.runPromiseExit
    )

    consoleSpy.mockRestore()

    expect(fakeLog).toBeCalled()
    expect(fakeLog.mock.calls[0][0]).toContain("Error: defect")
    expect(fakeLog.mock.calls[0][0]).toContain(
      "(@effect-ts/express/test): test/index.test.ts:54:22"
    )
  })
})
