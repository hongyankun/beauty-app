import type { ArticleSource } from '../types';

/**
 * 已核验的资料来源。
 *
 * 每一条的 URL 都在编写时实际访问过，标题取自页面自身的标题。
 * 多篇文章引用同一条来源时从这里取，避免同一个链接在各处被抄成不同写法。
 *
 * 收录范围限于监管机构、公立医疗体系、医学专业学会与公共医学信息库；
 * 不收录商业医美机构的营销文章，也不收录社交平台、论坛与短视频内容
 * （任务书第六节）。
 */
export const SOURCES = {
  nhsBeforeProcedure: {
    id: 'nhs-before-procedure',
    publisher: '英国国民医疗服务体系（NHS）',
    title: 'Before you have a cosmetic procedure',
    url: 'https://www.nhs.uk/tests-and-treatments/cosmetic-procedures/advice/before-you-have-a-cosmetic-procedure/',
    kind: 'publicHealth',
  },
  nhsRightForMe: {
    id: 'nhs-right-for-me',
    publisher: '英国国民医疗服务体系（NHS）',
    title: 'Is a cosmetic procedure right for me?',
    url: 'https://www.nhs.uk/tests-and-treatments/cosmetic-procedures/advice/cosmetic-procedure-right-for-me/',
    kind: 'publicHealth',
  },
  nhsChoosingPractitioner: {
    id: 'nhs-choosing-practitioner',
    publisher: '英国国民医疗服务体系（NHS）',
    title: 'Choosing who will do your cosmetic procedure',
    url: 'https://www.nhs.uk/tests-and-treatments/cosmetic-procedures/advice/choosing-who-will-do-your-procedure/',
    kind: 'publicHealth',
  },
  fdaDermalFillers: {
    id: 'fda-dermal-fillers',
    publisher: '美国食品药品监督管理局（FDA）',
    title: 'Dermal Fillers (Soft Tissue Fillers)',
    url: 'https://www.fda.gov/medical-devices/aesthetic-cosmetic-devices/dermal-fillers-soft-tissue-fillers',
    kind: 'regulator',
  },
  fdaMicroneedling: {
    id: 'fda-microneedling',
    publisher: '美国食品药品监督管理局（FDA）',
    title: 'Microneedling Devices',
    url: 'https://www.fda.gov/medical-devices/aesthetic-cosmetic-devices/microneedling-devices',
    kind: 'regulator',
  },
  fdaRfMicroneedlingSafety: {
    id: 'fda-rf-microneedling-safety',
    publisher: '美国食品药品监督管理局（FDA）',
    title:
      'Potential Risks with Certain Uses of Radiofrequency (RF) Microneedling – FDA Safety Communication',
    url: 'https://www.fda.gov/medical-devices/safety-communications/potential-risks-certain-uses-radiofrequency-rf-microneedling-fda-safety-communication',
    kind: 'regulator',
  },
  fdaBodyContouring: {
    id: 'fda-body-contouring',
    publisher: '美国食品药品监督管理局（FDA）',
    title: 'Non-Invasive Body Contouring Technologies',
    url: 'https://www.fda.gov/medical-devices/aesthetic-cosmetic-devices/non-invasive-body-contouring-technologies',
    kind: 'regulator',
  },
  fdaMedicalLasers: {
    id: 'fda-medical-lasers',
    publisher: '美国食品药品监督管理局（FDA）',
    title: 'Medical Lasers',
    url: 'https://www.fda.gov/radiation-emitting-products/surgical-and-therapeutic-products/medical-lasers',
    kind: 'regulator',
  },
  aadSafety: {
    id: 'aad-safety',
    publisher: '美国皮肤病学会（AAD）',
    title: 'Your safety',
    url: 'https://www.aad.org/public/cosmetic/safety',
    kind: 'professionalSociety',
  },
  aadAskQuestions: {
    id: 'aad-ask-questions',
    publisher: '美国皮肤病学会（AAD）',
    title: 'Best questions to ask when considering a cosmetic treatment',
    url: 'https://www.aad.org/public/cosmetic/safety/ask-questions',
    kind: 'professionalSociety',
  },
  aadBotulinumOverview: {
    id: 'aad-botulinum-overview',
    publisher: '美国皮肤病学会（AAD）',
    title: 'Botulinum toxin therapy: Overview',
    url: 'https://www.aad.org/public/cosmetic/wrinkles/botulinum-toxin-overview',
    kind: 'professionalSociety',
  },
  aadBotulinumFaqs: {
    id: 'aad-botulinum-faqs',
    publisher: '美国皮肤病学会（AAD）',
    title: 'Botulinum toxin therapy: FAQs',
    url: 'https://www.aad.org/public/cosmetic/wrinkles/botulinum-toxin-faqs',
    kind: 'professionalSociety',
  },
  aadFillersFaqs: {
    id: 'aad-fillers-faqs',
    publisher: '美国皮肤病学会（AAD）',
    title: 'Fillers: FAQs',
    url: 'https://www.aad.org/public/cosmetic/wrinkles/fillers-faqs',
    kind: 'professionalSociety',
  },
  aadMicroneedling: {
    id: 'aad-microneedling',
    publisher: '美国皮肤病学会（AAD）',
    title: 'Microneedling can fade scars, uneven skin tone, and more',
    url: 'https://www.aad.org/public/cosmetic/scars-stretch-marks/microneedling-fade-scars',
    kind: 'professionalSociety',
  },
  aadChemicalPeelsOverview: {
    id: 'aad-chemical-peels-overview',
    publisher: '美国皮肤病学会（AAD）',
    title: 'Chemical peels: Overview',
    url: 'https://www.aad.org/public/cosmetic/younger-looking/chemical-peels-overview',
    kind: 'professionalSociety',
  },
  aadChemicalPeelsFaqs: {
    id: 'aad-chemical-peels-faqs',
    publisher: '美国皮肤病学会（AAD）',
    title: 'Chemical peels: FAQs',
    url: 'https://www.aad.org/public/cosmetic/younger-looking/chemical-peels-faqs',
    kind: 'professionalSociety',
  },
  aadFirmSaggingSkin: {
    id: 'aad-firm-sagging-skin',
    publisher: '美国皮肤病学会（AAD）',
    title: 'Many ways to firm sagging skin',
    url: 'https://www.aad.org/public/cosmetic/younger-looking/firm-sagging-skin',
    kind: 'professionalSociety',
  },
  aadAgeSpots: {
    id: 'aad-age-spots',
    publisher: '美国皮肤病学会（AAD）',
    title: 'What can get rid of age spots?',
    url: 'https://www.aad.org/public/cosmetic/age-spots-marks/get-rid-spots',
    kind: 'professionalSociety',
  },
  medlinePlusBotox: {
    id: 'medlineplus-botox',
    publisher: '美国国立医学图书馆 MedlinePlus（NIH）',
    title: 'Botox',
    url: 'https://medlineplus.gov/botox.html',
    kind: 'medicalLibrary',
  },
} as const satisfies Record<string, ArticleSource>;
