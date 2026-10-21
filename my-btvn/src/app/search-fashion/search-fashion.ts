import { HttpClient } from '@angular/common/http';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface Fashion {
  _id: string;
  idf: number;
  slug: string;
  style?: string;
  fashion_subject?: string;
  fashion_detail?: string;
  fashion_image?: string;
}

interface FashionSearchResult extends Fashion {
  jaccard_similarity: number;
}

@Component({
  imports: [FormsModule],
  selector: 'app-search-fashion',
  styleUrl: './search-fashion.css',
  templateUrl: './search-fashion.html',
})
export class SearchFashionComponent {
  private readonly apiUrl = 'http://localhost:3003';
  private detailRequest = 0;

  protected readonly query = signal('');
  protected readonly searchField = signal<'fashion_subject' | 'fashion_detail'>(
    'fashion_subject',
  );
  protected readonly resultLimit = signal(12);
  protected readonly results = signal<FashionSearchResult[]>([]);
  protected readonly selectedFashion = signal<Fashion | null>(null);
  protected readonly loading = signal(false);
  protected readonly detailLoading = signal(false);
  protected readonly hasSearched = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly detailError = signal('');

  constructor(private readonly http: HttpClient) {}

  protected search(): void {
    const searchTerm = this.query().trim();
    if (!searchTerm || this.loading()) {
      return;
    }

    this.loading.set(true);
    this.hasSearched.set(true);
    this.errorMessage.set('');
    this.detailError.set('');
    this.detailRequest += 1;
    this.detailLoading.set(false);
    this.selectedFashion.set(null);
    this.http
      .get<FashionSearchResult[]>(`${this.apiUrl}/fashions/search`, {
        params: {
          q: searchTerm,
          field: this.searchField(),
          limit: this.resultLimit(),
        },
      })
      .subscribe({
        next: (results) => {
          this.results.set(results);
          this.loading.set(false);
        },
        error: () => {
          this.errorMessage.set(
            'Không thể tải kết quả. Hãy kiểm tra MongoDB và máy chủ API.',
          );
          this.results.set([]);
          this.loading.set(false);
        },
      });
  }

  protected openFashion(slug: string): void {
    const request = ++this.detailRequest;
    this.detailLoading.set(true);
    this.detailError.set('');
    this.selectedFashion.set(null);
    this.http
      .get<Fashion>(`${this.apiUrl}/fashions/slug/${encodeURIComponent(slug)}`)
      .subscribe({
        next: (fashion) => {
          if (request !== this.detailRequest) {
            return;
          }
          this.selectedFashion.set(fashion);
          this.detailLoading.set(false);
        },
        error: () => {
          if (request !== this.detailRequest) {
            return;
          }
          this.detailError.set(
            'Không thể tải Fashion Detail cho slug này. Vui lòng thử lại.',
          );
          this.detailLoading.set(false);
        },
      });
  }

  protected clearSearch(): void {
    this.detailRequest += 1;
    this.query.set('');
    this.results.set([]);
    this.selectedFashion.set(null);
    this.hasSearched.set(false);
    this.errorMessage.set('');
    this.detailError.set('');
    this.detailLoading.set(false);
  }

  protected formatSimilarity(similarity: number): string {
    return `${(similarity * 100).toFixed(0)}%`;
  }

  protected hideBrokenImage(event: Event): void {
    (event.target as HTMLImageElement).hidden = true;
  }
}
