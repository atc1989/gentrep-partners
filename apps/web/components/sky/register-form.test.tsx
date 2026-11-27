import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RegisterForm, Thanks, type RegFields } from "./register-form";

const off: RegFields = { reg_category_label: "Specialty", reg_categories: [], reg_show_address: false, reg_show_source: false };
const on: RegFields = { reg_category_label: "Specialty", reg_categories: ["Dentist", "Nurse"], reg_show_address: true, reg_show_source: true };
const form = (reg: RegFields, refCode?: string) => renderToStaticMarkup(<RegisterForm slug="demo" name="Shop" reg={reg} refCode={refCode} />);

describe("registration form markup", () => {
  test("always asks for title, name, email, mobile and city; the extras stay hidden when switched off", () => {
    const html = form(off);
    for (const label of ["Title (optional)", "Full name", "Email", "Mobile number", "City"]) expect(html).toContain(label);
    expect(html).toContain("No title");
    for (const hidden of ["Specialty", "Address", "Where did you find us?"]) expect(html).not.toContain(hidden);
  });

  test("category, address and source appear when the business turns them on", () => {
    const html = form(on);
    expect(html).toContain("Specialty");
    expect(html).toContain("<option value=\"Dentist\">Dentist</option>");
    expect(html).toContain("Address");
    expect(html).toContain("Where did you find us?");
  });

  test("the ref line shows only with a ref code", () => {
    expect(form(off)).not.toContain("Ref number");
    expect(form(off, "123456")).toContain("Ref number #123456");
  });

  test("the thank-you screen points to the emailed link and shows no QR or code", () => {
    const html = renderToStaticMarkup(<Thanks name="Shop" first="Ana" email="ana@example.test" />);
    expect(html).toContain("Thank you, Ana.");
    expect(html).toContain("personal QR link to ana@example.test");
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("<canvas");
    expect(html).not.toContain("Ref number");
  });
});
