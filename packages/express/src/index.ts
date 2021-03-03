import * as T from "@effect-ts/core/Effect"
import * as L from "@effect-ts/core/Effect/Layer"
import * as M from "@effect-ts/core/Effect/Managed"
import { literal } from "@effect-ts/system/Function"
import { tag } from "@effect-ts/system/Has"
import type { _A } from "@effect-ts/system/Utils"
import express from "express"
import type { Server } from "http"

export const makeExpressApp = T.gen(function* (_) {
  const app = yield* _(T.effectTotal(() => express()))

  return {
    _tag: literal("ExpressApp"),
    app
  }
})

export interface ExpressApp extends _A<typeof makeExpressApp> {}
export const ExpressApp = tag<ExpressApp>()
export const LiveExpressApp = L.fromEffect(ExpressApp)(makeExpressApp)

export class NodeServerCloseError {
  readonly _tag = "NodeServerCloseError"
  constructor(readonly error: Error) {}
}

export class NodeServerListenError {
  readonly _tag = "NodeServerListenError"
  constructor(readonly error: Error) {}
}

export interface ExpressServerConfig {
  readonly _tag: "ExpressServerConfig"
  readonly port: number
  readonly host: string
}

export const ExpressServerConfig = tag<ExpressServerConfig>()

export const LiveExpressServerConfig = (host: string, port: number) =>
  L.succeed(ExpressServerConfig.of({ _tag: "ExpressServerConfig", host, port })).setKey(
    ExpressServerConfig.key
  )

export const makeExpressServer = M.gen(function* (_) {
  const { app } = yield* _(ExpressApp)
  const { host, port } = yield* _(ExpressServerConfig)

  const server = yield* _(
    M.make_(
      T.effectAsync<unknown, never, Server>((cb) => {
        const onError = (err: Error) => {
          cb(T.die(new NodeServerListenError(err)))
        }
        const server = app.listen(port, host, () => {
          cb(
            T.effectTotal(() => {
              server.removeListener("error", onError)
              return server
            })
          )
        })
        server.addListener("error", onError)
      }),
      (server) =>
        T.effectAsync<unknown, never, void>((cb) => {
          server.close((err) => {
            if (err) {
              cb(T.die(new NodeServerCloseError(err)))
            } else {
              cb(T.unit)
            }
          })
        })
    )
  )

  return {
    _tag: literal("ExpressServer"),
    server
  }
})

export interface ExpressServer extends _A<typeof makeExpressServer> {}
export const ExpressServer = tag<ExpressServer>()
export const LiveExpressServer = L.fromManaged(ExpressServer)(makeExpressServer)

export const LiveExpress = (host: string, port: number) =>
  LiveExpressServerConfig(host, port)[">+>"](LiveExpressApp[">+>"](LiveExpressServer))

export const expressApp = T.accessService(ExpressApp)((_) => _.app)

export const expressServer = T.accessService(ExpressServer)((_) => _.server)

export const { app: withExpressApp } = T.deriveAccessM(ExpressApp)(["app"])

export const { server: withExpressServer } = T.deriveAccessM(ExpressServer)(["server"])
