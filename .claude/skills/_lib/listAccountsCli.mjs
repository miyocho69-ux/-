import { listAccounts } from "./accounts.mjs";

const accounts = await listAccounts();
if (accounts.length === 0) {
  console.log("등록된 계좌가 없습니다. 웹 대시보드(/accounts)에서 먼저 계좌를 등록하세요.");
} else {
  for (const a of accounts) {
    console.log(`${a.id}\t${a.name}\t${a.broker ?? "-"}\t${a.market}`);
  }
}
