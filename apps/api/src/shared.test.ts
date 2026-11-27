import { describe, expect, test } from "bun:test";
import { INK, PAGE_GRAY, cleanText, contrast, csvCell, deriveTheme, isEmail, isSlug, normalizeMobile, safeUrl, slugify } from "./shared";

describe("slugify", () => {
  test("turns a name into a valid address", () => {
    expect(slugify("Juan's Health Shop")).toBe("juans-health-shop");
    expect(slugify("  Café   Ñandú  ")).toBe("cafe-nandu");
    expect(slugify("A")).toBe("a-site");
    expect(slugify("!!!")).toBe("my-site");
    expect(slugify("x".repeat(80)).length).toBe(40);
  });
  test("whatever goes in, what comes out passes the rule", () => {
    for (const name of ["Ab", "--", "a--b", "Müller & Söhne GmbH", "日本語", "123", "-x-", "a".repeat(39) + "-b"]) {
      expect(isSlug(slugify(name))).toBe(true);
    }
  });
  test("isSlug refuses bad shapes", () => {
    for (const s of ["ab", "-ab", "ab-", "a--b", "A_b", "a.b", "a b", "x".repeat(41), ""]) expect(isSlug(s)).toBe(false);
    for (const s of ["abc", "a-b", "shop-2", "x".repeat(40)]) expect(isSlug(s)).toBe(true);
  });
});

describe("people fields", () => {
  test("PH mobile numbers normalise to +639XXXXXXXXX", () => {
    for (const ok of ["09171234567", "0917 123 4567", "0917-123-4567", "+639171234567", "+63 917 123 4567", "639171234567", "(0917) 123 4567"]) {
      expect(normalizeMobile(ok)).toBe("+639171234567");
    }
    for (const bad of ["0917123456", "091712345678", "+6391712345", "0817 123 4567", "abc", "", "+1 555 123 4567"]) expect(normalizeMobile(bad)).toBeNull();
  });
  test("email and text cleaning", () => {
    expect(isEmail("a@b.co")).toBe(true);
    for (const bad of ["a@b", "a b@c.de", "@b.co", "a@@b.co", "a".repeat(250) + "@b.co"]) expect(isEmail(bad)).toBe(false);
    expect(cleanText("  Ana\u0000  \n Cruz\t")).toBe("Ana Cruz");
  });
  test("only http and https links are ever shown", () => {
    expect(safeUrl("https://facebook.com/x")).toBe("https://facebook.com/x");
    expect(safeUrl("http://example.test")).toBe("http://example.test/");
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "ftp://x.y", "//x.y", "not a url", "", null, undefined]) expect(safeUrl(bad as string)).toBeNull();
  });
});

describe("brand colour", () => {
  test("every colour comes out readable: white text 5:1, the colour as text 4.5:1 on the page, ink on the pale panel 4.5:1", () => {
    let seed = 42;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const samples = ["#ffffff", "#000000", "#ffff00", "#00ff00", "#ff0000", "#0068d0", "#f2f2f2", "#eeeeee", "#fafad2"];
    for (let i = 0; i < 600; i++) samples.push(`#${Math.floor(rnd() * 0xffffff).toString(16).padStart(6, "0")}`);
    for (const c of samples) {
      const t = deriveTheme(c);
      expect(contrast("#ffffff", t.brand)).toBeGreaterThanOrEqual(5);
      expect(contrast(PAGE_GRAY, t.brand)).toBeGreaterThanOrEqual(4.5);
      expect(contrast("#ffffff", t.hover)).toBeGreaterThanOrEqual(5);
      expect(contrast(INK, t.pale)).toBeGreaterThanOrEqual(4.5);
      expect(t.hover).not.toBe(t.brand);
    }
  });
  test("a colour that is already fine is kept; a bad input falls back to the default", () => {
    expect(deriveTheme("#0068d0")).toMatchObject({ brand: "#0068d0", adjusted: false });
    expect(deriveTheme("#ffeb3b").adjusted).toBe(true);
    expect(deriveTheme("nope").brand).toBe("#0068d0");
    expect(deriveTheme(null).brand).toBe("#0068d0");
    expect(deriveTheme("#7C3AED").brand).toBe("#7c3aed");
  });
});

describe("csv cells", () => {
  test("formula-looking text is neutralised, plain numbers and normal text are not", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("+639171234567")).toBe("'+639171234567");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\tx")).toBe("'\tx");
    expect(csvCell("-2+3")).toBe("'-2+3");
    expect(csvCell("-12.5")).toBe("-12.5");
    expect(csvCell("Maria")).toBe("Maria");
    expect(csvCell(null)).toBe("");
  });
  test("quotes, commas and line breaks are escaped", () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
  });
});
