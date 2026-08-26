// Contoh data soal. Ganti/isi sesuai kebutuhan, atau fetch dari API.
export const examInfo = {
  title: "Ujian Matematika Dasar",
  code: "MTK-101",
  durationMinutes: 30,
  totalQuestions: 5,
};

export const questions = [
  {
    id: 1,
    text: "Berapakah hasil dari 12 x 8?",
    options: [
      { key: "A", text: "86" },
      { key: "B", text: "96" },
      { key: "C", text: "106" },
      { key: "D", text: "116" },
    ],
  },
  {
    id: 2,
    text: "Manakah dari berikut ini yang merupakan bilangan prima?",
    options: [
      { key: "A", text: "21" },
      { key: "B", text: "27" },
      { key: "C", text: "29" },
      { key: "D", text: "33" },
    ],
  },
  {
    id: 3,
    text: "Jika x + 7 = 15, maka nilai x adalah...",
    options: [
      { key: "A", text: "6" },
      { key: "B", text: "7" },
      { key: "C", text: "8" },
      { key: "D", text: "9" },
    ],
  },
  {
    id: 4,
    text: "Luas persegi panjang dengan panjang 9 cm dan lebar 4 cm adalah...",
    options: [
      { key: "A", text: "13 cm²" },
      { key: "B", text: "26 cm²" },
      { key: "C", text: "36 cm²" },
      { key: "D", text: "40 cm²" },
    ],
  },
  {
    id: 5,
    text: "Hasil dari 3/4 + 1/4 adalah...",
    options: [
      { key: "A", text: "1/2" },
      { key: "B", text: "1" },
      { key: "C", text: "4/8" },
      { key: "D", text: "3/8" },
    ],
  },
];
