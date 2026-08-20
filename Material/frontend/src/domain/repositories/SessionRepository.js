// The port for "where the signed-in session is kept". The use cases decide
// when a session starts, is restored or ends; they must not know that it lives
// in localStorage or that a 401 is what kills it. Infrastructure supplies that.
export class SessionRepository {
  read() { throw new Error("Not implemented"); }
  isExpired() { throw new Error("Not implemented"); }
  save() { throw new Error("Not implemented"); }
  clear() { throw new Error("Not implemented"); }
  onEnded() { throw new Error("Not implemented"); }
}
