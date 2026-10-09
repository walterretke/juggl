import { describe, expect, it } from "vitest";
import { reconhecerLink } from "./links";

describe("reconhecerLink", () => {
  it.each([
    [
      "https://teams.microsoft.com/l/message/19:abc@thread.v2/1728400000000?tenantId=x",
      "teams",
      "1728400000000",
    ],
    ["https://teams.microsoft.com/l/chat/19:abc/0", "teams", null],
    ["https://empresa.atlassian.net/browse/OPS-123", "jira", "OPS-123"],
    ["https://empresa.atlassian.net/jira/software/projects/OPS/boards/1?selectedIssue=OPS-9", "jira", "OPS-9"],
    ["https://jira.empresa.com.br/browse/INFRA-77", "jira", "INFRA-77"],
    ["https://empresa.service-now.com/nav_to.do?uri=incident.do?sysparm_query=number=INC0012345", "servicenow", "INC0012345"],
    [
      "https://empresa.service-now.com/incident.do?sys_id=0123456789abcdef0123456789abcdef",
      "servicenow",
      "0123456789abcdef0123456789abcdef",
    ],
    ["https://dev.azure.com/org/Projeto/_workitems/edit/4521", "devops", "4521"],
    ["https://org.visualstudio.com/Projeto/_workitems/edit/88", "devops", "88"],
    ["https://dev.azure.com/org/Projeto/_boards/board?workitem=12", "devops", "12"],
  ])("%s", (url, origem, id) => {
    expect(reconhecerLink(url)).toEqual({ url: new URL(url).href, origem, idExterno: id });
  });

  it.each(["https://google.com", "texto qualquer", "teams.microsoft.com/l/chat", "https://a.com e mais texto", ""])(
    "ignora %s",
    (texto) => {
      expect(reconhecerLink(texto)).toBeNull();
    },
  );

  it("aceita espaços em volta do link copiado", () => {
    expect(reconhecerLink("  https://dev.azure.com/org/p/_workitems/edit/1\n")?.idExterno).toBe("1");
  });
});
